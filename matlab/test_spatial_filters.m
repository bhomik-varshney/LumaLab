function test_spatial_filters(samplePath)
% Numerical invariants and independent measurements of the exported PNG.
impulse = zeros(9); impulse(5,5) = 1;
averaged = spatial_filter(impulse, 'mean', 3);
assert(abs(averaged(5,5)-1/9) < 1e-12 && abs(sum(averaged(:))-1) < 1e-12);
corner = zeros(3); corner(1,1) = 1;
averaged = spatial_filter(corner, 'mean', 3);
assert(abs(averaged(1,1)-4/9) < 1e-12); % Replicated boundary, not zero padding.
soft = spatial_filter(impulse, 'gaussian', 5, 0.5);
broad = spatial_filter(impulse, 'gaussian', 5, 1.5);
assert(soft(5,5) > broad(5,5) && abs(sum(broad(:))-1) < 1e-12);
assert(abs(broad(4,5)-broad(5,4)) < 1e-12);
noisy = uint8(ones(9)*128); noisy(4,4) = 0; noisy(6,6) = 255;
clean = spatial_filter(noisy, 'median', 3);
assert(isequal(clean, uint8(ones(9)*128)) && noisy(4,4) == 0);
step = [ones(9,4)*0.4 ones(9,5)*0.6];
sharp = spatial_filter(step, 'unsharp', 5, 1, 1);
assert(sharp(5,4) < 0.4 && sharp(5,5) > 0.6);
assert(isequal(spatial_filter(step, 'unsharp', 5, 1, 0), step));
edges = spatial_filter(step, 'sobel');
assert(edges(5,4) > 0 && edges(5,1) < 1e-12 && all(edges(:) <= 1));

methods = {'mean','gaussian','median','unsharp','sobel'};
for imageClass = {'uint8','uint16','int16','single','double','logical'}
    input = restore_image_class([0.2 0.4 0.6 0.8], imageClass{1});
    for method = methods
        output = spatial_filter(input, method{1}, 3, 1, 1);
        assert(strcmp(class(output), class(input)) && isequal(size(output), size(input)));
        values = normalize_image(output);
        assert(all(isfinite(values(:))) && all(values(:) >= 0 & values(:) <= 1));
    end
end
for kernelSize = [3 5 7]
    for method = methods
        tiny = spatial_filter(uint8(128), method{1}, kernelSize);
        assert(isscalar(tiny));
        if strcmp(method{1}, 'sobel'), assert(tiny == 0); else, assert(tiny == 128); end
    end
end
rgb = cat(3, step+0.03, step, step-0.03);
for method = {'mean','gaussian','median','unsharp'}
    output = spatial_filter(rgb, method{1}, 3, 1, 1);
    difference = (output(:,:,1)-output(:,:,2)) - (rgb(:,:,1)-rgb(:,:,2));
    assert(max(abs(difference(:))) < 1e-12); % Interior gamut: chrominance retained.
end
assert(size(spatial_filter(rgb, 'sobel'),3) == 1);
for kernelSize = [0 2 4 9 NaN]
    rejected = false;
    try, spatial_filter(step,'mean',kernelSize); catch, rejected = true; end
    assert(rejected);
end
for settings = {[3 0 1], [3 4 1], [3 1 -1], [3 1 4], [3 NaN 1]}
    rejected = false; values = settings{1};
    try, spatial_filter(step,'unsharp',values(1),values(2),values(3)); catch, rejected = true; end
    assert(rejected);
end

folder = tempname; mkdir(folder);
cleanup = onCleanup(@() rmdir(folder, 's'));
job = struct('inputPath', fullfile(folder,'gray.png'), ...
    'originalPath', fullfile(folder,'original.png'), 'outputPath', fullfile(folder,'result.png'), ...
    'category','spatial','parameters',struct());
imwrite(noisy, job.inputPath);
for source = {job.inputPath, samplePath}
    job.inputPath = source{1};
    for method = methods
        job.method = method{1};
        result = process_job(job);
        saved = imread(job.outputPath);
        [stats, bins] = image_analysis(saved);
        assert(stats.width == result.original.width && stats.height == result.original.height);
        assert(isequal(bins, result.histograms.enhanced));
        assert(abs(stats.mean-result.enhanced.mean) < 1e-10);
        assert(abs(stats.deviation-result.enhanced.deviation) < 1e-10);
        assert(sum(bins) == stats.width*stats.height && strcmp(result.category,'spatial'));
        if strcmp(method{1},'sobel')
            assert(strcmp(result.outputKind,'edge-map') && result.enhanced.channels == 1);
        end
    end
end
alpha = uint8(ones(9)*192);
imwrite(uint16(cat(3,noisy,noisy,noisy))*257, fullfile(folder,'rgba16.png'), 'Alpha', uint16(alpha)*257);
job.inputPath = fullfile(folder,'rgba16.png'); job.method = 'median';
result = process_job(job);
[saved,~,savedAlpha] = imread(job.outputPath);
assert(isa(saved,'uint16') && isequal(savedAlpha,uint16(alpha)*257));
assert(result.enhanced.channels == 3);
disp('PASS: mean/Gaussian/median/unsharp/Sobel, grayscale/RGB, boundaries, small images, classes, alpha, invalid settings, and saved-image histograms/statistics.');
end
