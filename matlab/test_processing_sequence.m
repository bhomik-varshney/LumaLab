function test_processing_sequence()
assert(isequal(sort(available_operation_ids()),sort({'gamma','equalize','stretch','mean','gaussian','median','unsharp','sobel'})));
folder = tempname; mkdir(folder);
cleanup = onCleanup(@() rmdir(folder,'s'));
[x,y] = meshgrid(0:24,0:22);
tone = uint8(25 + mod(x*7+y*13,190));
input = cat(3,tone+uint8(15),tone,tone-uint8(15));
input(12,13,:) = 255;
alpha = uint8(ones(23,25)*192);
inputPath = fullfile(folder,'input.png');
imwrite(input,inputPath,'Alpha',alpha);
steps = {struct('category','intensity','method','gamma','parameters',struct('gamma',0.7)), ...
    struct('category','spatial','method','median','parameters',struct('kernelSize',5)), ...
    struct('category','intensity','method','stretch','parameters',struct('lowCutoff',0.05,'highCutoff',0.95))};
job = struct('inputPath',inputPath,'outputPath',fullfile(folder,'result.png'), ...
    'originalPath',fullfile(folder,'original.png'),'steps',{steps}, ...
    'progressPath',fullfile(folder,'progress.json'));
first = enhance_image(input,'gamma',0.7);
second = spatial_filter(first,'median',5);
expected = enhance_image(second,'stretch',1,0.05,0.95);
result = process_job(job);
[saved,~,savedAlpha] = imread(job.outputPath);
assert(isequal(saved,expected) && isequal(savedAlpha,alpha));
[originalSaved,~,originalAlpha] = imread(job.originalPath);
[inputSaved,~,inputAlpha] = imread(inputPath);
assert(isequal(originalSaved,input) && isequal(inputSaved,input));
assert(isequal(originalAlpha,alpha) && isequal(inputAlpha,alpha));
[stats,bins] = image_analysis(saved);
assert(isequal(bins,result.histograms.enhanced) && abs(stats.mean-result.enhanced.mean) < 1e-10);
assert(strcmp(result.method,'sequence') && numel(result.steps) == 3);
[firstInfo,~] = image_analysis(first);
assert(abs(result.steps{1}.output.mean-firstInfo.mean) < 1e-10);
assert(result.steps{2}.parameters.kernelSize == 5);
progress = jsondecode(fileread(job.progressPath));
assert(strcmp(progress.state,'complete') && progress.completedSteps == 3 && progress.total == 3);
job.steps = steps([3 2 1]);
process_job(job);
[reordered,~,~] = imread(job.outputPath);
assert(~isequal(reordered,expected)); % Order matters.

% Every available method uses the shared dispatcher in a sequence.
job.steps = {steps{1},struct('method','equalize','parameters',struct()), ...
    struct('method','mean','parameters',struct('kernelSize',9)), ...
    struct('method','gaussian','parameters',struct('kernelSize',11,'sigma',1.4)), ...
    steps{2},struct('method','unsharp','parameters',struct('kernelSize',13,'sigma',1.2,'amount',1.5))};
result = process_job(job);
assert(numel(result.steps) == 6 && result.enhanced.channels == 3);
job.steps = {struct('method','sobel','parameters',struct()),steps{1},steps{3}};
result = process_job(job);
assert(result.enhanced.channels == 1 && strcmp(result.outputKind,'edge-map'));

% A failure after a successful first step cannot export a partial result.
delete(job.outputPath); delete(job.originalPath);
job.steps = {steps{1},struct('method','median','parameters',struct('kernelSize',4)),steps{3}};
rejected = false;
try, process_job(job); catch exception
    rejected = strcmp(exception.identifier,'LumaLab:SequenceStep') && contains(exception.message,'Step 2 (median) failed');
end
assert(rejected && ~isfile(job.outputPath) && ~isfile(job.originalPath));
progress = jsondecode(fileread(job.progressPath));
assert(strcmp(progress.state,'error') && progress.step == 2 && progress.completedSteps == 1);
for invalidSteps = {{},repmat(steps,1,3)}
    job.steps = invalidSteps{1}; rejected = false;
    try, process_job(job); catch, rejected = true; end
    assert(rejected);
end
disp('PASS: ordered MATLAB sequences, snapshots, all eight operations, original/alpha preservation, actual final/per-step statistics, progress, order changes, and no partial export on step failure.');
end
