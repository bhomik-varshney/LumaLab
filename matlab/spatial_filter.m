function output = spatial_filter(input, method, kernelSize, sigma, amount)
% Toolbox-free neighborhood filters. Replicate padding preserves dimensions,
% including images smaller than the neighborhood. RGB filters operate on Y'.
arguments
    input {mustBeNumericOrLogical, mustBeNonempty}
    method (1,:) char {mustBeMember(method, {'mean','gaussian','median','unsharp','sobel'})}
    kernelSize (1,1) double {mustBeMember(kernelSize, [3 5 7])} = 3
    sigma (1,1) double {mustBeFinite, mustBePositive} = 1
    amount (1,1) double {mustBeFinite, mustBeNonnegative} = 1
end
if sigma < 0.3 || sigma > 3 || amount > 3
    error('LumaLab:FilterSettings', 'Sigma must be 0.3-3 and sharpening strength must be 0-3.');
end
if ~ismember(class(input), {'uint8','uint16','int16','single','double','logical'}) || ...
        ndims(input) > 3 || ~ismember(size(input,3), [1 3])
    error('LumaLab:ImageType', 'Use a grayscale or RGB image with a supported numeric class.');
end
r = normalize_image(input);
if any(~isfinite(r(:))) || any(r(:) < 0 | r(:) > 1)
    error('LumaLab:ImageRange', 'Image intensities must be finite and normalized to [0, 1].');
end
isRGB = size(r,3) == 3;
if isRGB
    tone = 0.299*r(:,:,1) + 0.587*r(:,:,2) + 0.114*r(:,:,3);
else
    tone = r;
end
if strcmp(method, 'sobel')
    padded = replicate_pad(tone, 1);
    horizontal = [-1 0 1; -2 0 2; -1 0 1] / 4;
    gx = conv2(padded, horizontal, 'valid');
    gy = conv2(padded, horizontal', 'valid');
    % Fixed scale, not per-image auto contrast: each derivative is bounded
    % by 1 for normalized input. Magnitude/sqrt(2) is within [0, 1].
    s = hypot(gx, gy) / sqrt(2);
else
    radius = (kernelSize-1)/2;
    padded = replicate_pad(tone, radius);
    if strcmp(method, 'median')
        mapped = neighborhood_median(padded, size(tone), kernelSize);
    else
        if strcmp(method, 'mean')
            kernel = ones(kernelSize) / kernelSize^2;
        else
            [x, y] = meshgrid(-radius:radius);
            kernel = exp(-(x.^2 + y.^2) / (2*sigma^2));
            kernel = kernel / sum(kernel(:));
        end
        blurred = conv2(padded, kernel, 'valid');
        if strcmp(method, 'unsharp')
            mapped = tone + amount * (tone - blurred);
        else
            mapped = blurred;
        end
    end
    if isRGB
        s = r + (mapped-tone); % Preserve Cb/Cr before RGB gamut clipping.
    else
        s = mapped;
    end
end
output = restore_image_class(min(1, max(0, s)), class(input));
end

function padded = replicate_pad(image, radius)
[height, width] = size(image);
rows = [ones(1,radius), 1:height, height*ones(1,radius)];
columns = [ones(1,radius), 1:width, width*ones(1,radius)];
padded = image(rows, columns);
end

function output = neighborhood_median(padded, dimensions, kernelSize)
% Bounded batches avoid allocating an image-sized stack of all neighbors.
height = dimensions(1); width = dimensions(2);
output = zeros(height, width);
batchSize = 32768;
for first = 1:batchSize:height*width
    indices = first:min(first+batchSize-1, height*width);
    [rows, columns] = ind2sub([height width], indices);
    neighbors = zeros(kernelSize^2, numel(indices));
    index = 0;
    for columnOffset = 0:kernelSize-1
        for rowOffset = 0:kernelSize-1
            index = index+1;
            addresses = sub2ind(size(padded), rows+rowOffset, columns+columnOffset);
            neighbors(index,:) = padded(addresses);
        end
    end
    output(indices) = median(neighbors, 1);
end
end
