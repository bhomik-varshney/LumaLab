function write_job_progress(job, progress)
% Atomic progress from real MATLAB step boundaries, owned by the bridge.
if ~isfield(job,'progressPath'), return; end
path = char(job.progressPath);
temporaryPath = [path '.tmp'];
file = fopen(temporaryPath,'w');
if file < 0, error('LumaLab:IO','Cannot write processing progress.'); end
cleanup = onCleanup(@() fclose(file));
fprintf(file,'%s',jsonencode(progress));
clear cleanup;
movefile(temporaryPath,path,'f');
end
