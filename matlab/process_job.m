function result = process_job(job)
metadata = imfinfo(job.inputPath);
if numel(metadata) ~= 1 || metadata.Width * metadata.Height > 16000000
    error('LumaLab:ImageSize', 'Use a single-frame image with at most 16 million pixels.');
end
[input, map, alpha] = imread(job.inputPath);
if ~isempty(map)
    input = restore_image_class(ind2rgb(input, map), 'uint8');
end
outputKind = 'enhanced';
completed = {};
if isfield(job,'noise')
    [output, noise] = add_image_noise(input, job.noise);
    operation = struct('category','noise','method','noise','parameters',struct(), ...
        'gamma',1,'lowCutoff',0.1,'highCutoff',0.9);
elseif isfield(job,'steps')
    steps = job.steps;
    if ~(iscell(steps) || isstruct(steps)) || isempty(steps) || numel(steps) > 6
        error('LumaLab:Sequence','Add between 1 and 6 operations to the sequence.');
    end
    output = input;
    for index = 1:numel(steps)
        if iscell(steps), step = steps{index}; else, step = steps(index); end
        name = 'unknown';
        if isstruct(step) && isfield(step,'method') && (ischar(step.method) || isstring(step.method))
            name = char(step.method);
        end
        progress = struct('state','processing','step',index,'total',numel(steps), ...
            'method',name,'completedSteps',index-1);
        write_job_progress(job,progress);
        try
            [output, operation] = apply_operation(output,step);
            [info,~] = image_analysis(output);
            completed{index} = struct('category',operation.category,'method',operation.method, ...
                'parameters',operation.parameters,'output',info);
            if strcmp(operation.method,'sobel'), outputKind = 'edge-map'; end
        catch exception
            message = sprintf('Step %d (%s) failed: %s',index,name,exception.message);
            progress.state = 'error'; progress.error = message;
            write_job_progress(job,progress);
            error('LumaLab:SequenceStep','%s',message);
        end
    end
    operation = struct('category','sequence','method','sequence','parameters',struct(), ...
        'gamma',1,'lowCutoff',0.1,'highCutoff',0.9);
    progress.state = 'exporting'; progress.completedSteps = numel(steps);
    write_job_progress(job,progress);
else
    [output,operation] = apply_operation(input,job);
    if strcmp(operation.method,'sobel'), outputKind = 'edge-map'; end
end
[originalInfo, originalHistogram] = image_analysis(input);
[enhancedInfo, enhancedHistogram] = image_analysis(output);
write_png(input, job.originalPath, alpha);
write_png(output, job.outputPath, alpha);
result = struct('original',originalInfo,'enhanced',enhancedInfo, ...
    'histograms',struct('original',originalHistogram,'enhanced',enhancedHistogram), ...
    'category',operation.category,'method',operation.method,'parameters',operation.parameters, ...
    'outputKind',outputKind,'gamma',operation.gamma,'lowCutoff',operation.lowCutoff, ...
    'highCutoff',operation.highCutoff,'processor','MATLAB');
if isfield(job,'noise'), result.noise = noise; end
if isfield(job,'steps')
    result.steps = completed;
    progress.state = 'complete';
    write_job_progress(job,progress);
end
end

function write_png(image, path, alpha)
% PNG stores unsigned samples; signed/floating arrays use an explicit mapping.
if isa(image, 'int16')
    image = restore_image_class(normalize_image(image), 'uint16');
elseif isfloat(image)
    image = restore_image_class(image, 'uint16');
end
if isempty(alpha)
    imwrite(image, path, 'png');
else
    imwrite(image, path, 'png', 'Alpha', alpha);
end
end
