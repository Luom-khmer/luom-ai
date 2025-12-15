/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { 
    processApiError,
    parseDataUrl, 
    callGeminiWithRetry, 
    processGeminiResponse 
} from './baseService';

interface PhotoRestorationOptions {
    type: string;
    gender: string;
    age: string;
    nationality: string;
    notes?: string;
    removeWatermark?: boolean;
    removeStains?: boolean;
    colorizeRgb?: boolean;
}

export async function restoreOldPhoto(imageDataUrl: string, options: PhotoRestorationOptions): Promise<string> {
    const { mimeType, data: base64Data } = parseDataUrl(imageDataUrl);
    const imagePart = { inlineData: { mimeType, data: base64Data } };

    const promptParts = [
        'Bạn là một chuyên gia chỉnh sửa ảnh kỹ thuật số (AI Photo Editor).',
        'Nhiệm vụ: Cải thiện chất lượng và độ rõ nét của hình ảnh đầu vào (Image Upscaling & Restoration).',
        '**HƯỚNG DẪN:**'
    ];
    
    // Make colorization the absolute first command if requested.
    if (options.colorizeRgb) {
        promptParts.push(
            '1. **TÔ MÀU ẢNH:** Nếu ảnh là đen trắng hoặc phai màu, hãy tô màu lại cho bức ảnh này với màu sắc tự nhiên, sống động và chân thực.'
        );
    } else {
        promptParts.push(
            '1. **Màu sắc:** Giữ nguyên tông màu gốc hoặc điều chỉnh nhẹ nhàng để trông tự nhiên hơn, giữ lại nét hoài cổ.'
        );
    }

    if (options.removeStains) {
        promptParts.push('2. **Sửa chữa:** Loại bỏ các vết xước, nếp gấp, vết ố, nhiễu hạt (noise) và các hư hỏng vật lý trên ảnh.');
    } else {
        promptParts.push('2. **Sửa chữa cơ bản:** Giảm thiểu nhiễu hạt nhưng giữ lại các chi tiết quan trọng.');
    }

    promptParts.push(
        '3. **Tăng cường chi tiết:** Làm sắc nét hình ảnh (sharpening) và tăng độ phân giải một cách tự nhiên.',
        '4. **Giữ nguyên bản chất:** KHÔNG thay đổi các đặc điểm nhận dạng trên khuôn mặt người, bố cục, hay nội dung gốc của ảnh. Đây là nhiệm vụ chỉnh sửa ảnh, KHÔNG phải tạo ra người mới.',
        '',
        '**THÔNG TIN BỔ SUNG (Context):**'
    );

    if (options.type) {
        promptParts.push(`- **Loại ảnh:** ${options.type}.`);
    }
    if (options.gender && options.gender !== 'Tự động') {
        promptParts.push(`- **Giới tính:** ${options.gender}.`);
    }
    if (options.age) {
        promptParts.push(`- **Độ tuổi ước tính:** ${options.age}.`);
    }
    if (options.nationality) {
        promptParts.push(`- **Quốc tịch:** ${options.nationality}.`);
    }

    if (options.notes) {
        promptParts.push(`- **Ghi chú từ người dùng:** "${options.notes}".`);
    }
    if (options.removeWatermark) {
        promptParts.push('- **Yêu cầu đặc biệt:** Loại bỏ watermark, logo, chữ ký nếu có.');
    }

    promptParts.push('', 'Chỉ trả về hình ảnh đã được xử lý.');

    const prompt = promptParts.join('\n');
    const textPart = { text: prompt };

    try {
        console.log("Attempting to restore old photo with optimized prompt...");
        const response = await callGeminiWithRetry([imagePart, textPart]);
        return processGeminiResponse(response);
    } catch (error) {
        const processedError = processApiError(error);
        console.error("Error during photo restoration:", processedError);
        throw processedError;
    }
}
