/**
 * Use Case: SelectBestStream
 * Logic nghiệp vụ để quyết định nguồn phát nào là tốt nhất dựa trên sở thích người dùng
 * và tính khả dụng của dữ liệu.
 */

export interface StreamSelectionResult {
  type: string;
  provider: string;
}

export class SelectBestStream {
  /**
   * Thực thi logic chọn nguồn
   * @param streamableSources Dữ liệu nguồn từ Registry
   * @param preferredSource Cấu hình ưu tiên của người dùng
   * @param currentType Loại hiện tại (để giữ nguyên nếu hợp lệ)
   */
  execute(
    streamableSources: Record<string, Record<string, any[]>>,
    preferredSource: string = 'auto',
    currentType?: string,
    currentProvider?: string
  ): StreamSelectionResult | null {
    if (Object.keys(streamableSources).length === 0) return null;

    // HLS first: native player with backend ad-proxy → no third-party trackers.
    // EMBED is a fallback for streams that only have an iframe link.
    const typesOrder = ['HLS', 'EMBED'];

    // 1. Nếu người dùng chọn đích danh 1 Provider (ví dụ: KKPHIM)
    if (preferredSource !== 'auto') {
      for (const type of typesOrder) {
        if (streamableSources[type]?.[preferredSource]) {
          return { type, provider: preferredSource };
        }
      }
    }

    // 2. ƯU TIÊN: Nếu đang có type và provider đang chọn, hãy giữ nguyên nó
    if (currentType && currentProvider && streamableSources[currentType]?.[currentProvider]) {
        return { type: currentType, provider: currentProvider };
    }

    // 3. Nếu đã có type đang chọn, ưu tiên tìm provider trong type đó
    if (currentType && streamableSources[currentType]) {
      const providers = Object.keys(streamableSources[currentType]);
      if (providers.length > 0) {
        return { type: currentType, provider: providers[0] };
      }
    }

    // 3. Fallback mặc định: Tìm provider đầu tiên theo thứ tự HLS -> EMBED
    for (const type of typesOrder) {
      const providers = Object.keys(streamableSources[type] || {});
      if (providers.length > 0) {
        return { type, provider: providers[0] };
      }
    }

    return null;
  }
}
