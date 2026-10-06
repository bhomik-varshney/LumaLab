function output = enhance_image(input, method, gamma, lowCutoff, highCutoff)
% Pure enhancement: preserve the input, dimensions, numeric class and range.
arguments
    input {mustBeNumericOrLogical, mustBeNonempty}
    method (1,:) char {mustBeMember(method, {'gamma','equalize','stretch'})}
    gamma (1,1) double {mustBeFinite, mustBePositive} = 1
    lowCutoff (1,1) double {mustBeFinite, mustBeNonnegative} = 0.1
    highCutoff (1,1) double {mustBeFinite, mustBePositive} = 0.9
end
if lowCutoff >= highCutoff || highCutoff > 1 || highCutoff - lowCutoff < 1e-6
    error('LumaLab:Cutoffs', 'Choose cutoffs within 0-100%%, with low below high (at least 0.0001%% apart).');
end
if ~ismember(class(input), {'uint8','uint16','int16','single','double','logical'}) || ...
        ndims(input) > 3 || ~ismember(size(input,3), [1 3])
    error('LumaLab:ImageType', 'Use a grayscale or RGB image with a supported numeric class.');
end
r = normalize_image(input);
if any(~isfinite(r(:))) || any(r(:) < 0 | r(:) > 1)
    error('LumaLab:ImageRange', 'Floating-point image intensities must be finite and within [0, 1].');
end
if strcmp(method, 'gamma')
    if gamma == 1
        output = input; % Exact identity, including 16-bit inputs.
        return;
    end
    s = r .^ gamma;
else
    isRGB = size(r,3) == 3;
    if isRGB
        tone = 0.299*r(:,:,1) + 0.587*r(:,:,2) + 0.114*r(:,:,3);
    else
        tone = r;
    end
    low = min(tone(:));
    high = max(tone(:));
    tolerance = eps(max(1, high));
    if strcmp(method, 'stretch'), tolerance = max(tolerance, 1e-6); end
    if high - low <= tolerance
        output = input; % Constant images have no contrast to redistribute.
        return;
    end
    if strcmp(method, 'equalize')
        % CDF equalization with the first occupied bin removed. Base MATLAB
        % only: 256 levels, and no mandatory Image Processing Toolbox.
        levels = round(tone * 255) + 1;
        counts = accumarray(levels(:), 1, [256 1]);
        cumulative = cumsum(counts);
        first = cumulative(find(counts > 0, 1));
        if numel(tone) == first
            output = input;
            return;
        end
        mapping = max(0, (cumulative - first) / (numel(tone) - first));
        mapped = reshape(mapping(levels(:)), size(tone));
    else
        % Explicit input-range mapping in base MATLAB. Cutoffs are normalized
        % brightness, not percentiles; clipping is applied before RGB recovery.
        mapped = min(1, max(0, (tone - lowCutoff) / (highCutoff - lowCutoff)));
    end
    if isRGB
        % Adding the same Y' delta to R/G/B preserves full-range BT.601
        % Cb/Cr before clipping: Y' coefficients sum to one and Cb/Cr to zero.
        s = r + (mapped - tone);
    else
        s = mapped;
    end
end
s = min(1, max(0, s));
output = restore_image_class(s, class(input));
end
