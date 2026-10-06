function result = process_job(job)
metadata = imfinfo(job.inputPath);
if numel(metadata) ~= 1 || metadata.Width * metadata.Height > 16000000
    error('LumaLab:ImageSize', 'Use a single-frame image with at most 16 million pixels.');
end
[input, map, alpha] = imread(job.inputPath);
if ~isempty(map)
    input = restore_image_class(ind2rgb(input, map), 'uint8');
end
output = enhance_image(input, char(job.method), job.gamma);
[originalInfo, originalHistogram] = image_analysis(input);
[enhancedInfo, enhancedHistogram] = image_analysis(output);
write_png(input, job.originalPath, alpha);
write_png(output, job.outputPath, alpha);
result = struct('original', originalInfo, 'enhanced', enhancedInfo, ...
    'histograms', struct('original', originalHistogram, 'enhanced', enhancedHistogram), ...
    'method', job.method, 'gamma', job.gamma, 'processor', 'MATLAB');
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
