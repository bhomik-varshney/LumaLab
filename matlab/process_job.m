function result = process_job(job)
metadata = imfinfo(job.inputPath);
if numel(metadata) ~= 1 || metadata.Width * metadata.Height > 16000000
    error('LumaLab:ImageSize', 'Use a single-frame image with at most 16 million pixels.');
end
[input, map, alpha] = imread(job.inputPath);
if ~isempty(map)
    input = restore_image_class(ind2rgb(input, map), 'uint8');
end
method = char(job.method);
intensityMethods = {'gamma','equalize','stretch'};
spatialMethods = {'mean','gaussian','median','unsharp','sobel'};
if ~ismember(method, [intensityMethods spatialMethods])
    error('LumaLab:Method', 'Choose a supported intensity transformation or spatial filter.');
end
if ismember(method, intensityMethods), category = 'intensity'; else, category = 'spatial'; end
if isfield(job, 'category') && ~strcmp(char(job.category), category)
    error('LumaLab:Category', 'Category does not match the selected method.');
end
if isfield(job, 'parameters')
    settings = job.parameters;
    if ~isstruct(settings) || ~isscalar(settings)
        error('LumaLab:Parameters', 'Method parameters must be a JSON object.');
    end
else
    settings = job; % Compatibility with established intensity jobs.
end
gamma = setting(settings, 'gamma', 1);
lowCutoff = setting(settings, 'lowCutoff', 0.1);
highCutoff = setting(settings, 'highCutoff', 0.9);
switch method
    case 'gamma', parameters = struct('gamma', gamma);
    case 'equalize', parameters = struct();
    case 'stretch', parameters = struct('lowCutoff', lowCutoff, 'highCutoff', highCutoff);
    case 'sobel', parameters = struct();
    otherwise
        defaultKernel = 3;
        if ismember(method, {'gaussian','unsharp'}), defaultKernel = 5; end
        kernelSize = setting(settings, 'kernelSize', defaultKernel);
        sigma = setting(settings, 'sigma', 1);
        amount = setting(settings, 'amount', 1);
        parameters = struct('kernelSize', kernelSize);
        if ismember(method, {'gaussian','unsharp'}), parameters.sigma = sigma; end
        if strcmp(method, 'unsharp'), parameters.amount = amount; end
end
if isfield(job, 'parameters') && any(~ismember(fieldnames(settings), fieldnames(parameters)))
    error('LumaLab:Parameters', 'Only send parameters for the selected method.');
end
if strcmp(category, 'intensity')
    output = enhance_image(input, method, gamma, lowCutoff, highCutoff);
else
    output = spatial_filter(input, method, setting(parameters,'kernelSize',3), ...
        setting(parameters,'sigma',1), setting(parameters,'amount',1));
end
outputKind = 'enhanced';
if strcmp(method, 'sobel'), outputKind = 'edge-map'; end
[originalInfo, originalHistogram] = image_analysis(input);
[enhancedInfo, enhancedHistogram] = image_analysis(output);
write_png(input, job.originalPath, alpha);
write_png(output, job.outputPath, alpha);
result = struct('original', originalInfo, 'enhanced', enhancedInfo, ...
    'histograms', struct('original', originalHistogram, 'enhanced', enhancedHistogram), ...
    'category', category, 'method', method, 'parameters', parameters, ...
    'outputKind', outputKind, 'gamma', gamma, ...
    'lowCutoff', lowCutoff, 'highCutoff', highCutoff, 'processor', 'MATLAB');
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

function value = setting(settings, field, fallback)
if isfield(settings, field), value = settings.(field); else, value = fallback; end
end
