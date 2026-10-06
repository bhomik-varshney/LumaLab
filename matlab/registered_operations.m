function operations = registered_operations()
% One capability file defines bridge validation, assistant context and MATLAB dispatch.
folder = fileparts(fileparts(mfilename('fullpath')));
registry = jsondecode(fileread(fullfile(folder,'shared','operations.json')));
operations = registry.operations;
available = arrayfun(@(item) exist(item.implementation,'file')==2,operations);
operations = operations(available);
end
