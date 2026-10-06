function [info, histogram] = image_analysis(image)
% Full-resolution BT.601 Y' statistics, scaled to 0-255; alpha is excluded.
r = normalize_image(image);
if size(r,3) == 3
    tone = 0.299*r(:,:,1) + 0.587*r(:,:,2) + 0.114*r(:,:,3);
else
    tone = r;
end
tone = min(1, max(0, tone));
values = tone(:) * 255;
info = struct('width', size(image,2), 'height', size(image,1), ...
    'channels', size(image,3), 'imageClass', class(image), ...
    'mean', mean(values), 'deviation', std(values, 1));
histogram = accumarray(round(values) + 1, 1, [256 1])';
end
