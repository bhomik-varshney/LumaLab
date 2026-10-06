function test_noise_playground()
folder=tempname; mkdir(folder); cleanup=onCleanup(@() rmdir(folder,'s')); %#ok<NASGU>
[x,y]=meshgrid(0:30,0:24); tone=uint8(45+mod(x*5+y*7,160));
rgb=cat(3,tone+uint8(12),tone,tone-uint8(12));
settings={struct('type','salt-pepper','density',0.2,'seed',42), ...
    struct('type','gaussian','standardDeviation',0.08,'seed',42)};
for source={tone,rgb,uint16(tone)*257,single(double(rgb)/255),double(tone)/255,int16(double(tone)*257-32768),logical(tone>128)}
    input=source{1};
    for index=1:2
        state=rng; first=add_image_noise(input,settings{index});
        assert(isequal(rng,state)); % Reproducibility must not perturb the worker RNG.
        second=add_image_noise(input,settings{index});
        assert(isequal(first,second) && strcmp(class(first),class(input)) && isequal(size(first),size(input)));
        normalized=normalize_image(first); assert(all(normalized(:)>=0 & normalized(:)<=1));
        changed=settings{index}; changed.seed=43;
        if ~(islogical(input) && index==2)
            assert(~isequal(first,add_image_noise(input,changed)));
        end % Binary images can quantize small Gaussian perturbations away.
    end
end
% Shared RGB perturbations preserve chrominance until clipping/rounding.
noise=add_image_noise(double(rgb)/255,settings{2}); delta=noise-double(rgb)/255;
valid=all(noise>0 & noise<1,3);
a=delta(:,:,1); b=delta(:,:,2); c=delta(:,:,3);
assert(max(abs(a(valid)-b(valid)))<1e-12 && max(abs(b(valid)-c(valid)))<1e-12);
noise=add_image_noise(rgb,settings{1});
changed=any(noise~=rgb,3); plane=noise(:,:,1);
assert(all(plane(changed)==0 | plane(changed)==255));
assert(isequal(noise(:,:,1)==0,noise(:,:,2)==0) && isequal(noise(:,:,2)==255,noise(:,:,3)==255));
for index=1:2
    zero=settings{index}; if index==1,zero.density=0;else,zero.standardDeviation=0;end
    assert(isequal(add_image_noise(rgb,zero),rgb));
    assert(isequal(size(add_image_noise(uint8(128),settings{index})),[1,1]));
end
% Real worker jobs save the actual clean/noisy pixels, alpha, histograms and stats.
for input={tone,rgb}
    inputPath=fullfile(folder,'clean.png'); alpha=uint8(ones(size(tone))*190);
    imwrite(input{1},inputPath,'Alpha',alpha);
    for index=1:2
        job=struct('inputPath',inputPath,'outputPath',fullfile(folder,'noisy.png'), ...
            'originalPath',fullfile(folder,'original.png'),'noise',settings{index});
        result=process_job(job); [saved,~,a]=imread(job.outputPath);
        expected=add_image_noise(input{1},settings{index}); assert(isequal(saved,expected) && isequal(a,alpha));
        [original,~,~]=imread(job.originalPath); assert(isequal(original,input{1}));
        [info,bins]=image_analysis(saved); assert(isequal(bins,result.histograms.enhanced) && abs(info.mean-result.enhanced.mean)<1e-12);
        process_job(job); [repeated,~,~]=imread(job.outputPath); assert(isequal(repeated,saved)); % No accumulation.
        for method={'mean','median'}
            filterJob=rmfield(job,'noise'); filterJob.inputPath=job.outputPath;
            filterJob.outputPath=fullfile(folder,'filtered.png'); filterJob.method=method{1}; filterJob.parameters=struct('kernelSize',5);
            filtered=process_job(filterJob); [actual,~,~]=imread(filterJob.outputPath);
            assert(isequal(actual,spatial_filter(saved,method{1},5)));
            assert(~isequal(actual,spatial_filter(input{1},method{1},5)));
            [stats,bins]=image_analysis(actual); assert(isequal(bins,filtered.histograms.enhanced) && abs(stats.mean-filtered.enhanced.mean)<1e-12);
        end
    end
end
for invalid={struct('type','salt-pepper','density',0.31,'seed',1), ...
        struct('type','gaussian','standardDeviation',NaN,'seed',1), ...
        struct('type','gaussian','standardDeviation',0.05,'seed',-1), ...
        struct('type','gaussian','standardDeviation',0.05,'seed',1,'variance',0.1)}
    rejected=false; try,add_image_noise(rgb,invalid{1});catch,rejected=true;end;assert(rejected);
end
disp('PASS: grayscale/RGB noise, seeds/RNG isolation, no accumulation, zero strength, class/range/alpha, saved histograms, noisy-input mean/median filtering, and invalid parameters.');
end
