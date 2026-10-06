function lumalab_worker(workDir)
% One MATLAB process handles an atomic filesystem queue owned by the bridge.
toolboxAvailable = ~isempty(ver('images')) && license('test', 'image_toolbox');
write_json(fullfile(workDir, 'ready.json'), struct('version', version, 'toolbox', toolboxAvailable));
while ~isfile(fullfile(workDir, 'stop'))
    requests = dir(fullfile(workDir, '*.request.json'));
    for index = 1:numel(requests)
        path = fullfile(workDir, requests(index).name);
        responsePath = strrep(path, '.request.json', '.response.json');
        try
            job = jsondecode(fileread(path));
            payload = struct('ok', true, 'result', process_job(job));
        catch exception
            payload = struct('ok', false, 'error', exception.message, 'code', exception.identifier);
        end
        write_json(responsePath, payload);
        delete(path);
    end
    pause(0.1);
end
end

function write_json(path, value)
temporaryPath = [path '.tmp'];
file = fopen(temporaryPath, 'w');
if file < 0, error('LumaLab:IO', 'Cannot write the worker response.'); end
cleanup = onCleanup(@() fclose(file));
fprintf(file, '%s', jsonencode(value));
clear cleanup;
movefile(temporaryPath, path, 'f');
end
