import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('PWA Manifest Configuration', () => {
  it('MUST define at least one icon (>= 144px) to be installable (RED test)', () => {
    // vite.config.ts の内容をテキストとして読み込む
    const configPath = path.resolve(__dirname, 'vite.config.ts');
    const configContent = fs.readFileSync(configPath, 'utf-8');

    // 正規表現で manifest 内の icons 配列を簡易的に抽出
    const iconsMatch = configContent.match(/icons:\s*\[([\s\S]*?)\]/);
    
    // icons 配列自体が存在しなければFAIL
    expect(iconsMatch).not.toBeNull();
    
    if (iconsMatch) {
      const iconsContent = iconsMatch[1].trim();
      // icons配列が空（`icons: []`）の場合はインストール不可となるためFAIL
      expect(iconsContent.length).toBeGreaterThan(0);
      
      // さらに、144px以上のサイズ指定（例: '192x192' や '512x512'）が含まれていることを期待
      const hasValidSize = /192x192|512x512|144x144/.test(iconsContent);
      expect(hasValidSize).toBe(true);
    }
  });
});
