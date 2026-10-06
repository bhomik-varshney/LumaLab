function output = restore_image_class(normalized, imageClass)
normalized = min(1, max(0, normalized));
switch imageClass
    case 'uint8', output = uint8(round(normalized * 255));
    case 'uint16', output = uint16(round(normalized * 65535));
    case 'int16', output = int16(round(normalized * 65535 - 32768));
    case 'single', output = single(normalized);
    case 'double', output = normalized;
    case 'logical', output = normalized >= 0.5;
end
end
