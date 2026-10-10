function test_region_processing()
folder = tempname; mkdir(folder); cleanup = onCleanup(@() rmdir(folder,'s'));
[x,y] = meshgrid(0:30,0:24);
tone = uint8(mod(x*19+y*37,256)); rgb = cat(3,tone,tone+uint8(18),tone-uint8(22));
roi = struct('x',0,'y',3,'width',8,'height',10);
rows = roi.y+(1:roi.height); cols = roi.x+(1:roi.width);
mask = true(size(tone)); mask(rows,cols) = false;
for image = {rgb,tone,uint16(rgb)*257}
    input = image{1};
    for method = {'mean','gaussian','median','unsharp','sobel'}
        step = struct('method',method{1},'parameters',struct());
        [full,~] = apply_operation(input,step);
        [actual,~] = apply_region_operation(input,step,roi);
        expected = input; patch = full(rows,cols,:);
        if size(input,3)==3 && size(patch,3)==1, patch=repmat(patch,1,1,3); end
        expected(rows,cols,:) = patch;
        assert(isequal(actual,expected));
        for channel=1:size(input,3)
            a=actual(:,:,channel); b=input(:,:,channel); assert(isequal(a(mask),b(mask)));
        end
    end
end
% Equalization uses the selected region's histogram, not unrelated image tones.
step = struct('method','equalize','parameters',struct());
[actual,~] = apply_region_operation(rgb,step,roi);
[patch,~] = apply_operation(rgb(rows,cols,:),step);
assert(isequal(actual(rows,cols,:),patch));
inputPath=fullfile(folder,'input.png');alpha=uint8(ones(size(tone))*170);imwrite(rgb,inputPath,'Alpha',alpha);
steps={struct('method','gamma','parameters',struct('gamma',0.65)),struct('method','median','parameters',struct('kernelSize',15)),struct('method','sobel','parameters',struct())};
job=struct('inputPath',inputPath,'outputPath',fullfile(folder,'out.png'),'originalPath',fullfile(folder,'original.png'), ...
    'roiOutputPath',fullfile(folder,'region.png'),'roiOriginalPath',fullfile(folder,'region-original.png'),'roi',roi,'steps',{steps});
result=process_job(job);[saved,~,savedAlpha]=imread(job.outputPath);
expected=rgb; for i=1:numel(steps), [expected,~]=apply_region_operation(expected,steps{i},roi); end
assert(isequal(saved,expected) && isequal(savedAlpha,alpha));
[savedOriginal,~,~]=imread(job.originalPath);assert(isequal(savedOriginal,rgb));
[savedRegion,~,~]=imread(job.roiOutputPath);assert(isequal(savedRegion,saved(rows,cols,:)));
assert(strcmp(result.outputKind,'roi-composite') && isequal(result.roi,roi));
[info,bins]=image_analysis(saved(rows,cols,:));
assert(isequal(result.roiAnalysis.histograms.enhanced,bins) && result.roiAnalysis.enhanced.mean==info.mean);
assert(numel(result.steps)==3);
for invalid = {struct('x',24,'y',0,'width',8,'height',8),struct('x',0,'y',0,'width',7,'height',8),struct('x',0.5,'y',0,'width',8,'height',8)}
    rejected=false;try,apply_region_operation(rgb,step,invalid{1});catch,rejected=true;end;assert(rejected);
end
% Bottom/right border uses the same replicated image boundary as full filtering.
edge=struct('x',23,'y',17,'width',8,'height',8);
[actual,~]=apply_region_operation(rgb,steps{2},edge);full=spatial_filter(rgb,'median',15);
assert(isequal(actual(18:25,24:31,:),full(18:25,24:31,:)));
disp('PASS: ROI RGB/grayscale/uint16, exact outside pixels, true neighboring context, image boundaries, local equalization, ordered sequence, Sobel composite, alpha, focused PNG/statistics, and invalid regions.');
end
