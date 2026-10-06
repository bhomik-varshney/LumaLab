function [output, operation] = apply_operation(input, step)
% Shared, in-memory dispatcher for single operations and ordered sequences.
% Every call preserves the input class; sequences never encode between steps.
if ~isstruct(step) || ~isscalar(step) || ~isfield(step,'method')
    error('LumaLab:Method', 'Choose a method and its parameters.');
end
method = char(step.method);
intensityMethods = {'gamma','equalize','stretch'};
spatialMethods = {'mean','gaussian','median','unsharp','sobel'};
if ~ismember(method, [intensityMethods spatialMethods])
    error('LumaLab:Method', 'Choose a supported intensity transformation or spatial filter.');
end
if ismember(method,intensityMethods), category = 'intensity'; else, category = 'spatial'; end
if isfield(step,'category') && ~strcmp(char(step.category),category)
    error('LumaLab:Category', 'Category does not match the selected method.');
end
if isfield(step,'parameters')
    settings = step.parameters;
    if ~isstruct(settings) || ~isscalar(settings)
        error('LumaLab:Parameters', 'Method parameters must be a JSON object.');
    end
else
    settings = step; % Preserve established flat intensity requests.
end
gamma = setting(settings,'gamma',1);
lowCutoff = setting(settings,'lowCutoff',0.1);
highCutoff = setting(settings,'highCutoff',0.9);
switch method
    case 'gamma', parameters = struct('gamma',gamma);
    case 'equalize', parameters = struct();
    case 'stretch', parameters = struct('lowCutoff',lowCutoff,'highCutoff',highCutoff);
    case 'sobel', parameters = struct();
    otherwise
        defaultKernel = 3;
        if ismember(method,{'gaussian','unsharp'}), defaultKernel = 5; end
        parameters = struct('kernelSize',setting(settings,'kernelSize',defaultKernel));
        if ismember(method,{'gaussian','unsharp'}), parameters.sigma = setting(settings,'sigma',1); end
        if strcmp(method,'unsharp'), parameters.amount = setting(settings,'amount',1); end
end
if isfield(step,'parameters') && any(~ismember(fieldnames(settings),fieldnames(parameters)))
    error('LumaLab:Parameters', 'Only send parameters for the selected method.');
end
if strcmp(category,'intensity')
    output = enhance_image(input,method,gamma,lowCutoff,highCutoff);
else
    output = spatial_filter(input,method,setting(parameters,'kernelSize',3), ...
        setting(parameters,'sigma',1),setting(parameters,'amount',1));
end
operation = struct('category',category,'method',method,'parameters',parameters, ...
    'gamma',gamma,'lowCutoff',lowCutoff,'highCutoff',highCutoff);
end

function value = setting(settings,field,fallback)
if isfield(settings,field), value = settings.(field); else, value = fallback; end
end
