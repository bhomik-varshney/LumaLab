function test_enhancement(samplePath)
% Focused numeric and file-boundary checks; no toolbox or generated repo files.
gray = uint8([0 32 64; 128 192 255]);
original = gray;
bright = enhance_image(gray, 'gamma', 0.6);
dark = enhance_image(gray, 'gamma', 1.8);
assert(isequal(enhance_image(gray, 'gamma', 1), gray));
assert(all(bright(:) >= gray(:)) && any(bright(:) > gray(:)));
assert(all(dark(:) <= gray(:)) && any(dark(:) < gray(:)));
assert(isequal(gray, original));
assert(isequal(bright, uint8(round(255 * (double(gray)/255).^0.6))));
for imageClass = {'uint8','uint16','int16','single','double','logical'}
    input = restore_image_class([0 0.25 0.5 0.75 1], imageClass{1});
    for method = {'gamma','equalize','stretch'}
        output = enhance_image(input, method{1}, 0.6);
        assert(strcmp(class(output), class(input)) && isequal(size(output), size(input)));
        normalized = normalize_image(output);
        assert(all(normalized(:) >= 0 & normalized(:) <= 1));
    end
    assert(isequal(enhance_image(input, 'gamma', 1), input));
end
equalized = enhance_image(uint8([50 50 100 150]), 'equalize', 1);
assert(isequal(equalized, uint8([0 0 128 255])));
assert(isequal(enhance_image(uint16(ones(3)*32000), 'equalize', 1), uint16(ones(3)*32000)));
[info, counts] = image_analysis(gray);
assert(info.width == 3 && info.height == 2 && info.channels == 1);
assert(sum(counts) == numel(gray) && numel(counts) == 256);
assert(abs(info.mean - mean(double(gray(:)))) < 1e-10);
assert(abs(info.deviation - std(double(gray(:)), 1)) < 1e-10);
rgb = cat(3, [0.4 0.5], [0.45 0.55], [0.35 0.45]);
stretched = enhance_image(rgb, 'stretch', 1);
assert(all(stretched(:) >= 0 & stretched(:) <= 1));
% An interior pixel permits chroma preservation to be checked without clipping.
rgb = cat(3, [0 0.4 1], [0 0.45 1], [0 0.35 1]);
output = enhance_image(rgb, 'equalize', 1);
assert(abs((output(1,2,1)-output(1,2,2)) - (rgb(1,2,1)-rgb(1,2,2))) < 1e-12);
for gamma = [0 -1 NaN Inf]
    rejected = false;
    try, enhance_image(gray, 'gamma', gamma); catch, rejected = true; end
    assert(rejected);
end
rejected = false;
try, enhance_image([0 1.2], 'gamma', 1); catch, rejected = true; end
assert(rejected);

folder = tempname;
mkdir(folder);
cleanup = onCleanup(@() rmdir(folder, 's'));
alpha = uint8([0 64 255; 255 128 0]);
inputPath = fullfile(folder, 'rgba.png');
imwrite(cat(3,gray,gray,gray), inputPath, 'Alpha', alpha);
job = struct('inputPath', inputPath, 'outputPath', fullfile(folder,'out.png'), ...
    'originalPath', fullfile(folder,'original.png'), 'method','gamma','gamma',0.6);
result = process_job(job);
[saved, ~, savedAlpha] = imread(job.outputPath);
assert(isequal(savedAlpha, alpha) && result.original.channels == 3);
assert(isequal(saved(:,:,1), bright));
imwrite(uint16([0 32768 65535]), fullfile(folder, '16bit.png'));
job.inputPath = fullfile(folder, '16bit.png');
job.gamma = 1;
process_job(job);
assert(isequal(imread(job.outputPath), uint16([0 32768 65535])));

job.inputPath = samplePath;
for gamma = [0.6 1 1.8]
    job.method = 'gamma'; job.gamma = gamma;
    result = process_job(job);
    verify_result(result, job.outputPath);
end
for method = {'equalize','stretch'}
    job.method = method{1};
    result = process_job(job);
    verify_result(result, job.outputPath);
end
disp('PASS: gamma 0.6/1/1.8, equalization, stretching, classes, alpha, 16-bit PNG, histograms and statistics.');
end

function verify_result(result, path)
output = imread(path);
assert(size(output,2) == result.original.width && size(output,1) == result.original.height);
assert(sum(result.histograms.original) == result.original.width * result.original.height);
assert(sum(result.histograms.enhanced) == result.enhanced.width * result.enhanced.height);
assert(isfinite(result.enhanced.mean) && isfinite(result.enhanced.deviation));
end
