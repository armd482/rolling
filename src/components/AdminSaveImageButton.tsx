'use client';

import { useState } from 'react';
import { toCanvas } from 'html-to-image';

// 한 이미지의 최대 높이(CSS px). 이보다 길면 카드(질문/답변) 경계에서 나눠 저장한다.
const MAX_PAGE_HEIGHT = 4000;

// 결과 영역(#admin-capture)을 현재 화면 그대로 PNG 로 저장한다.
// 너무 길면 질문/답변(article)이 잘리지 않도록 카드 경계에서 여러 장으로 나눈다.
export default function AdminSaveImageButton() {
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    const node = document.getElementById('admin-capture');
    if (!node) {
      window.alert('저장할 결과가 없습니다.');
      return;
    }
    setBusy(true);
    try {
      const totalCss = node.scrollHeight;
      // 매우 길면 브라우저 캔버스 크기 한계를 넘지 않도록 배율을 낮춘다.
      const pixelRatio = Math.min(2, 15000 / Math.max(1, totalCss));

      const canvas = await toCanvas(node, {
        backgroundColor: '#ffffff',
        pixelRatio,
        cacheBust: true,
        // 교차 출처(Google Fonts) cssRules 접근 시 SecurityError 가 나므로 폰트 임베드는 건너뛴다.
        // 관리자 화면은 시스템 고딕으로 렌더되어 무방하다.
        skipFonts: true,
      });

      // 자르기 허용 지점 = 각 카드(article)의 바닥. 그 사이에서만 나눠 질문/답변이 잘리지 않게 한다.
      const nodeTop = node.getBoundingClientRect().top;
      const boundaries = Array.from(
        new Set(
          Array.from(node.querySelectorAll('article'))
            .map((a) => Math.round(a.getBoundingClientRect().bottom - nodeTop))
            .concat(Math.round(totalCss))
            .filter((y) => y > 0),
        ),
      ).sort((a, b) => a - b);

      // 페이지 분할: 각 페이지는 카드 1개 이상 포함하고, 가능한 한 MAX_PAGE_HEIGHT 이내로.
      // (한 카드가 MAX 보다 크면 자르지 않고 그 카드만 한 장으로 — 잘림 방지 우선)
      const pages: Array<[number, number]> = [];
      let start = 0;
      while (start < totalCss - 1) {
        let end = boundaries.find((b) => b > start) ?? totalCss;
        for (const b of boundaries) {
          if (b <= start) continue;
          if (b - start <= MAX_PAGE_HEIGHT) end = b;
          else break;
        }
        pages.push([start, end]);
        start = end;
      }

      const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      const download = (dataUrl: string, name: string) => {
        const a = document.createElement('a');
        a.download = name;
        a.href = dataUrl;
        a.click();
      };

      if (pages.length <= 1) {
        download(canvas.toDataURL('image/png'), `rolling-paper-${ts}.png`);
      } else {
        for (let i = 0; i < pages.length; i++) {
          const [s, e] = pages[i];
          const sy = Math.round(s * pixelRatio);
          const h = Math.round((e - s) * pixelRatio);
          const slice = document.createElement('canvas');
          slice.width = canvas.width;
          slice.height = h;
          const ctx = slice.getContext('2d');
          if (!ctx) continue;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, slice.width, slice.height);
          ctx.drawImage(canvas, 0, sy, canvas.width, h, 0, 0, canvas.width, h);
          download(
            slice.toDataURL('image/png'),
            `rolling-paper-${ts}-${String(i + 1).padStart(2, '0')}.png`,
          );
          // 브라우저가 다중 다운로드를 막지 않도록 약간 간격을 둔다.
          await new Promise((r) => setTimeout(r, 250));
        }
        window.alert(`내용이 길어 ${pages.length}장으로 나눠 저장했습니다.`);
      }
    } catch (e) {
      console.error(e);
      window.alert('이미지 저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={save}
      aria-label="이미지 저장"
      disabled={busy}
      className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? '저장 중…' : '이미지 저장'}
    </button>
  );
}
