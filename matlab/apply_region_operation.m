function [output, operation] = apply_region_operation(input, options, roi)
% Intensity mapping uses region statistics. Neighborhood filters read the full
% current image, including context outside the ROI, then composite only the ROI.
if isempty(roi)
    [output, operation] = apply_operation(input, options);
    return;
end
if ~isstruct(roi) || ~isscalar(roi) || ~isequal(sort(fieldnames(roi)),sort({'x';'y';'width';'height'}))
    error('LumaLab:Region','Use x, y, width and height for the selected region.');
end
for name = {'x','y','width','height'}
    value = roi.(name{1});
    if ~isnumeric(value) || ~isscalar(value) || ~isreal(value)
        error('LumaLab:Region','Use numeric scalar pixel coordinates and dimensions.');
    end
end
values = [roi.x roi.y roi.width roi.height];
if any(~isfinite(values)) || any(values ~= floor(values)) || roi.x < 0 || roi.y < 0 || ...
        roi.width < 8 || roi.height < 8 || roi.x + roi.width > size(input,2) || ...
        roi.y + roi.height > size(input,1)
    error('LumaLab:Region', 'Select a region of at least 8 by 8 pixels within the image.');
end
rows = roi.y + (1:roi.height); columns = roi.x + (1:roi.width);
if any(strcmp(options.method, {'mean','gaussian','median','unsharp','sobel'}))
    [filtered, operation] = apply_operation(input, options);
    patch = filtered(rows,columns,:);
else
    [patch, operation] = apply_operation(input(rows,columns,:), options);
end
if size(input,3) == 3 && size(patch,3) == 1
    % A local Sobel edge map is displayed as equal RGB channels inside the ROI.
    patch = repmat(patch,1,1,3);
end
output = input;
output(rows,columns,:) = patch;
end
