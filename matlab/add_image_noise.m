function [output, settings] = add_image_noise(input, settings)
% One shared random sample per pixel across RGB: luminance noise, not color noise.
if ~isstruct(settings) || ~isscalar(settings) || ~isfield(settings,'type') || ...
        ~any(strcmp(settings.type,{'salt-pepper','gaussian'}))
    error('LumaLab:Noise','Choose salt-and-pepper or Gaussian noise.');
end
if ~isfield(settings,'seed') || ~isnumeric(settings.seed) || ~isscalar(settings.seed) || ...
        ~isfinite(settings.seed) || settings.seed < 0 || settings.seed > 4294967295 || mod(settings.seed,1) ~= 0
    error('LumaLab:Noise','Seed must be an integer from 0 to 4294967295.');
end
if strcmp(settings.type,'salt-pepper'), field='density'; maximum=0.3;
else, field='standardDeviation'; maximum=0.2; end
if ~isfield(settings,field) || ~isnumeric(settings.(field)) || ~isscalar(settings.(field)) || ...
        ~isfinite(settings.(field)) || settings.(field) < 0 || settings.(field) > maximum || ...
        any(~ismember(fieldnames(settings),{'type','seed',field}))
    error('LumaLab:Noise','Invalid noise strength or unexpected parameters.');
end
if ~(ismatrix(input) || (ndims(input)==3 && size(input,3)==3)) || ...
        ~any(strcmp(class(input),{'uint8','uint16','int16','single','double','logical'}))
    error('LumaLab:Noise','Use a supported grayscale or RGB image.');
end
normalized = normalize_image(input);
if any(~isfinite(normalized(:))) || any(normalized(:)<0 | normalized(:)>1)
    error('LumaLab:Noise','Image values must lie in their supported intensity range.');
end
state = rng; cleanup = onCleanup(@() rng(state)); %#ok<NASGU>
rng(settings.seed,'twister');
if strcmp(settings.type,'salt-pepper')
    samples = rand(size(input,1),size(input,2));
    for channel = 1:size(input,3)
        plane = normalized(:,:,channel);
        plane(samples < settings.density/2) = 0;
        plane(samples >= settings.density/2 & samples < settings.density) = 1;
        normalized(:,:,channel) = plane;
    end
else
    normalized = normalized + settings.standardDeviation * randn(size(input,1),size(input,2));
end
output = restore_image_class(normalized,class(input));
end
