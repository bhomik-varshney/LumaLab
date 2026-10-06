function identifiers = available_operation_ids()
% Advertise only registry entries that the installed MATLAB dispatcher accepts.
definitions = registered_operations(); identifiers = {};
for index = 1:numel(definitions)
    try
        apply_operation(uint8([32 64;96 128]),struct('method',definitions(index).id));
        identifiers{end+1} = definitions(index).id; %#ok<AGROW>
    catch
        % Missing/unsupported implementations are unavailable, never advertised.
    end
end
end
