function normalized = normalize_image(image)
% Match image class ranges without requiring Image Processing Toolbox.
switch class(image)
    case 'uint8', normalized = double(image) / 255;
    case 'uint16', normalized = double(image) / 65535;
    case 'int16', normalized = (double(image) + 32768) / 65535;
    otherwise, normalized = double(image);
end
end
