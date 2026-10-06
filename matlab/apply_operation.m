function [output, operation] = apply_operation(input, step)
% Shared, in-memory dispatcher for single operations and ordered sequences.
% Every call preserves the input class; sequences never encode between steps.
if ~isstruct(step) || ~isscalar(step) || ~isfield(step,'method')
    error('LumaLab:Method', 'Choose a method and its parameters.');
end
method = char(step.method);
definitions = registered_operations();
index = find(strcmp({definitions.id},method),1);
if isempty(index), error('LumaLab:Method','Choose an available operation.'); end
definition = definitions(index); category = definition.category;
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
parameters = struct();
fields = fieldnames(definition.parameters);
for index = 1:numel(fields)
    field = fields{index}; rule = definition.parameters.(field);
    value = setting(settings,field,rule.default);
    if ~isnumeric(value) || ~isscalar(value) || ~isfinite(value) || ...
            (~isempty(rule.min) && value < rule.min) || (~isempty(rule.max) && value > rule.max) || ...
            (isfield(rule,'minExclusive') && rule.minExclusive && value == rule.min) || ...
            (isfield(rule,'integer') && rule.integer && mod(value,1)~=0) || ...
            (isfield(rule,'odd') && rule.odd && mod(value,2)~=1)
        error('LumaLab:Parameters','Invalid %s for %s.',field,definition.label);
    end
    parameters.(field) = value;
end
if strcmp(method,'stretch') && parameters.highCutoff-parameters.lowCutoff < definition.constraints.minGap
    error('LumaLab:Parameters','Cutoffs must have low below high.');
end
if isfield(step,'parameters') && any(~ismember(fieldnames(settings),fields))
    error('LumaLab:Parameters', 'Only send parameters for the selected method.');
end
gamma = setting(parameters,'gamma',1);
lowCutoff = setting(parameters,'lowCutoff',0.1);
highCutoff = setting(parameters,'highCutoff',0.9);
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
