"use client";

// QuickItem 목록의 단일 진실 소스 훅.
//
// 책임:
//  1. 파일 추가 시 ObjectURL 생성과 중복 파일명 차단
//  2. 항목 삭제/교체 시점에 ObjectURL revoke (메모리 누수 방지)
//  3. 선택 상태 (Set<string>) 관리 — Set 은 set/delete/has 가 모두 O(1)
//  4. 상세 패널에 표시할 detailItemId 관리
//  5. unmount 시 모든 ObjectURL 일괄 revoke
//
// 메모리 관리 invariant:
//  - previewUrl/cutoutResultUrl 은 한 번 생성되면 정확히 한 번 revoke 되어야 한다
//  - updateItem 으로 cutoutResultUrl 이 새 값으로 바뀌면 이전 값을 즉시 revoke
//  - removeItem 은 양쪽 URL 모두 revoke
//  - unmount cleanup 은 itemsRef 로 최신 목록을 추적해 모두 revoke
//
// 주의: React Strict Mode (dev) 에서 mount→unmount→re-mount 패턴은 unmount cleanup
// 을 한 번 추가로 호출한다. 그 시점에 revoke 되어도 ObjectURL 은 단순히 무효화될
// 뿐이라 다음 mount 의 <img> 가 실패한다. 따라서 이 훅은 dev 에서 페이지 첫 로드
// 직후 같은 파일을 곧바로 미리보지 않는다는 가정을 둔다 — 사용자가 파일을 올린
// 후의 두번째 mount 에서는 file 객체가 없으므로 문제 없음.

import { useCallback, useEffect, useRef, useState } from "react";
import type { QuickItem } from "./types";

function generateId(): string {
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function makeQuickItem(file: File): QuickItem {
  return {
    id: generateId(),
    file,
    previewUrl: URL.createObjectURL(file),
    format: "mood", // 기본 형식 prefill — 사용자가 드롭다운에서 변경 가능
    gender: "female",
    count: 1,
    status: "idle",
    progress: 0,
    jobId: null,
    resultUrl: null,
    resultAssetId: null,
    cutoutResultBlob: null,
    cutoutResultUrl: null,
    resultFormat: null,
    error: null,
  };
}

export interface UseQuickItemsOptions {
  /** 큐 최대 항목 수. 기본 60 (workspace). guest 는 장 수 무제한이라 옵션 미지정. */
  maxItems?: number;
}

export function useQuickItems({ maxItems = 60 }: UseQuickItemsOptions = {}) {
  const [items, setItems] = useState<QuickItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [detailItemId, setDetailItemId] = useState<string | null>(null);

  // unmount cleanup 을 위한 최신 items 추적용 ref. items state 의 closure 캡처를
  // 피하기 위해 매 렌더 갱신.
  const itemsRef = useRef<QuickItem[]>([]);
  itemsRef.current = items;

  // maxItems 변경 시 addFiles 가 stale closure 를 잡지 않도록 ref 로 추적.
  const maxItemsRef = useRef(maxItems);
  maxItemsRef.current = maxItems;

  /** 입력 파일들을 큐에 추가. 같은 이름 파일은 무시 (사용자가 같은 이미지를 여러 번
   *  드롭해도 중복 업로드를 방지). 20MB 초과/이미지 아님은 ItemListPanel 에서 사전
   *  필터링되므로 여기서는 단순화.
   *  최대 maxItems(기본 60)개 제한 — 초과분은 조용히 무시.
   *
   *  반환값: 실제로 큐에 추가된 항목의 id 배열. 빈 배열은 "추가된 게 없다"는 뜻.
   *  호출자는 이 배열을 사용해 추가 직후의 행에 메타 패치(예: format/count) 를 적용할
   *  수 있다 — 단, 중복/필터링으로 인해 ids.length < input.length 일 수 있으므로
   *  인덱스 매핑이 필요한 호출자는 길이 검증 후 사용해야 한다. */
  const addFiles = useCallback((input: FileList | File[]): string[] => {
    const files = Array.from(input);
    if (files.length === 0) return [];

    const remaining = maxItemsRef.current - itemsRef.current.length;
    if (remaining <= 0) return [];

    const wasEmpty = itemsRef.current.length === 0;
    const existing = new Set(itemsRef.current.map((i) => i.file.name));
    const newItems: QuickItem[] = [];

    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 20 * 1024 * 1024) continue;
      if (existing.has(f.name)) continue;
      existing.add(f.name);
      newItems.push(makeQuickItem(f));
    }

    const capped = newItems.slice(0, remaining);

    if (capped.length === 0) return [];
    setItems((prev) => [...prev, ...capped]);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const item of capped) next.add(item.id);
      return next;
    });

    if (wasEmpty) {
      setDetailItemId(capped[0].id);
    }

    return capped.map((it) => it.id);
  }, []);

  /** 항목 삭제 + 양쪽 ObjectURL revoke + 선택 상태/디테일 정리. */
  const removeItem = useCallback((id: string) => {
    const target = itemsRef.current.find((i) => i.id === id);
    if (target) {
      URL.revokeObjectURL(target.previewUrl);
      if (target.cutoutResultUrl) URL.revokeObjectURL(target.cutoutResultUrl);
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setDetailItemId((prev) => (prev === id ? null : prev));
  }, []);

  /** 부분 업데이트. patch.cutoutResultUrl 이 들어오면 이전 값을 revoke (URL 누수 방지). */
  const updateItem = useCallback((id: string, patch: Partial<QuickItem>) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        // cutoutResultUrl 이 *변경* 될 때만 이전 값 revoke. 같은 값을 다시 set 하는
        // 케이스(드물지만)에서는 revoke 하지 않는다.
        if (
          "cutoutResultUrl" in patch &&
          patch.cutoutResultUrl !== it.cutoutResultUrl &&
          it.cutoutResultUrl
        ) {
          URL.revokeObjectURL(it.cutoutResultUrl);
        }
        return { ...it, ...patch };
      }),
    );
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // selectAll/deselectAll 은 현재 items 의 id 전체에 대해 동작해야 하므로 items 의존성을
  // 가진다. 콜백 ref 를 선호할 수도 있지만 setSelectedIds 가 함수형이라 stale closure
  // 영향이 작아 단순화.
  const selectAll = useCallback(() => {
    setSelectedIds(new Set(itemsRef.current.map((i) => i.id)));
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // unmount 시 남은 ObjectURL 모두 revoke. 정상 흐름에서는 removeItem 이 처리하지만
  // 결과를 본 채로 페이지 이탈하는 경로에서 누수를 막는다.
  useEffect(() => {
    return () => {
      for (const it of itemsRef.current) {
        URL.revokeObjectURL(it.previewUrl);
        if (it.cutoutResultUrl) URL.revokeObjectURL(it.cutoutResultUrl);
      }
    };
  }, []);

  return {
    items,
    selectedIds,
    addFiles,
    removeItem,
    updateItem,
    toggleSelect,
    selectAll,
    deselectAll,
    detailItemId,
    setDetailItemId,
  };
}
