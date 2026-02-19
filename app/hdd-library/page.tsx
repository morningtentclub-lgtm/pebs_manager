'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { HddSet, HddFileEntry } from '@/lib/types';

// ─── 헬퍼 함수 ────────────────────────────────────────────────────────────────

function formatSize(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

// 파일 타입별 아이콘 색상 (영상 프로덕션 워크플로우 기준)
function getFileColor(ext: string | null): string {
  if (!ext) return 'text-gray-400';
  const videoExts = ['mov', 'mp4', 'mxf', 'avi', 'r3d', 'braw', 'mkv', 'arw', 'crm', 'mts', 'm2ts', 'prores'];
  const audioExts = ['wav', 'aiff', 'mp3', 'aac', 'flac', 'aif'];
  const projectExts = ['prproj', 'aep', 'drp', 'fcpx', 'fcp', 'xml', 'drpx', 'resolve'];
  const imageExts = ['jpg', 'jpeg', 'png', 'tiff', 'tif', 'dpx', 'exr', 'psd', 'psb', 'heic', 'raw', 'cr2', 'nef'];
  const docExts = ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'txt', 'csv'];
  if (videoExts.includes(ext)) return 'text-blue-500';
  if (audioExts.includes(ext)) return 'text-purple-500';
  if (projectExts.includes(ext)) return 'text-amber-500';
  if (imageExts.includes(ext)) return 'text-green-500';
  if (docExts.includes(ext)) return 'text-gray-500';
  return 'text-gray-400';
}

// 경로를 브레드크럼 세그먼트로 파싱
// "" → [{ label: hddName, path: "" }]
// "/A/B" → [{ label: hddName, path: "" }, { label: "A", path: "/A" }, { label: "B", path: "/A/B" }]
function parseBreadcrumbs(currentPath: string, hddName: string): Array<{ label: string; path: string }> {
  if (!currentPath) return [{ label: hddName, path: '' }];
  const parts = currentPath.split('/').filter(Boolean);
  const crumbs: Array<{ label: string; path: string }> = [{ label: hddName, path: '' }];
  parts.reduce((acc, part) => {
    const fullPath = acc + '/' + part;
    crumbs.push({ label: part, path: fullPath });
    return fullPath;
  }, '');
  return crumbs;
}

type SortField = 'name' | 'modified_at' | 'size_bytes' | 'extension';

function SortIcon({ field, sortField, sortDir }: {
  field: SortField;
  sortField: SortField;
  sortDir: 'asc' | 'desc';
}) {
  const active = field === sortField;
  return (
    <span className="flex flex-col gap-[1px] opacity-70">
      <svg className={`w-1.5 h-1.5 ${active && sortDir === 'asc' ? 'text-black' : 'text-[--gray-300]'}`} viewBox="0 0 10 6" fill="currentColor">
        <path d="M5 0L10 6H0L5 0Z" />
      </svg>
      <svg className={`w-1.5 h-1.5 ${active && sortDir === 'desc' ? 'text-black' : 'text-[--gray-300]'}`} viewBox="0 0 10 6" fill="currentColor">
        <path d="M5 6L0 0H10L5 6Z" />
      </svg>
    </span>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function HddLibraryPage() {
  const [hddSets, setHddSets] = useState<HddSet[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string>(''); // "" = 루트
  const [entries, setEntries] = useState<HddFileEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HddFileEntry[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [loadingSets, setLoadingSets] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [errorSets, setErrorSets] = useState('');
  const [errorEntries, setErrorEntries] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // HDD 세트 목록 불러오기
  const fetchHddSets = useCallback(async () => {
    setLoadingSets(true);
    setErrorSets('');
    const { data, error } = await supabase
      .from('hdd_sets')
      .select('*')
      .order('name', { ascending: false });

    if (error) {
      console.error('HDD 세트 불러오기 실패:', error);
      setErrorSets(`HDD 목록을 불러오지 못했습니다. (${error.message})`);
    } else {
      const sets = (data || []) as HddSet[];
      setHddSets(sets);
      if (sets.length > 0) {
        setSelectedSetId((prev) => prev ?? sets[0].id);
      }
    }
    setLoadingSets(false);
  }, []);

  useEffect(() => {
    fetchHddSets();
  }, [fetchHddSets]);

  // 선택된 세트 + 현재 경로의 파일 목록 불러오기
  const fetchEntries = useCallback(async () => {
    if (!selectedSetId) return;
    setLoadingEntries(true);
    setErrorEntries('');

    const { data, error } = await supabase
      .from('hdd_file_index')
      .select('*')
      .eq('hdd_set_id', selectedSetId)
      .eq('parent_path', currentPath)
      .order('is_dir', { ascending: false }) // 폴더 먼저
      .order(sortField, { ascending: sortDir === 'asc' });

    if (error) {
      console.error('파일 목록 불러오기 실패:', error);
      setErrorEntries(`파일 목록을 불러오지 못했습니다. (${error.message})`);
    } else {
      setEntries((data || []) as HddFileEntry[]);
    }
    setLoadingEntries(false);
  }, [selectedSetId, currentPath, sortField, sortDir]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // 검색 실행 (전체 레이드 대상)
  const handleSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSearchResults(null);
        return;
      }
      setIsSearching(true);
      const { data, error } = await supabase
        .from('hdd_file_index')
        .select('*')
        .ilike('name', `%${query.trim()}%`)
        .order('is_dir', { ascending: false })
        .order('name', { ascending: true })
        .limit(200);

      if (!error) {
        setSearchResults((data || []) as HddFileEntry[]);
      }
      setIsSearching(false);
    },
    []
  );

  // 검색어 디바운스 처리 (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        handleSearch(searchQuery);
      } else {
        setSearchResults(null);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, handleSearch]);

  // 폴더 탐색
  const navigateTo = (path: string, setId?: string) => {
    if (setId && setId !== selectedSetId) {
      setSelectedSetId(setId);
    }
    setCurrentPath(path);
    setSearchQuery('');
    setSearchResults(null);
  };

  // HDD 세트 전환
  const switchSet = (setId: string) => {
    setSelectedSetId(setId);
    setCurrentPath('');
    setSearchQuery('');
    setSearchResults(null);
  };

  // 세트 ID → 이름
  const getSetName = (hddSetId: string) =>
    hddSets.find((s) => s.id === hddSetId)?.name ?? '—';

  // 정렬 토글
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // 파생 상태
  const selectedSet = useMemo(
    () => hddSets.find((s) => s.id === selectedSetId) ?? null,
    [hddSets, selectedSetId]
  );

  const breadcrumbs = useMemo(
    () => parseBreadcrumbs(currentPath, selectedSet?.name ?? 'HDD'),
    [currentPath, selectedSet]
  );

  // 검색 결과는 클라이언트 정렬
  const sortedSearchResults = useMemo(() => {
    if (!searchResults) return null;
    return [...searchResults].sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      let cmp = 0;
      if (sortField === 'name') {
        cmp = a.name.localeCompare(b.name, 'ko');
      } else if (sortField === 'modified_at') {
        cmp = (a.modified_at ?? '').localeCompare(b.modified_at ?? '');
      } else if (sortField === 'size_bytes') {
        cmp = (a.size_bytes ?? 0) - (b.size_bytes ?? 0);
      } else if (sortField === 'extension') {
        cmp = (a.extension ?? '').localeCompare(b.extension ?? '');
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [searchResults, sortField, sortDir]);

  const displayedEntries = sortedSearchResults ?? entries;
  const isSearchMode = searchResults !== null;

  // ─── 렌더링 ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-white">
      {/* 페이지 헤더 */}
      <div className="bg-[--gray-50] border-b border-[--border]">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-[32px] font-semibold">HDD 라이브러리</h1>
          <p className="mt-1 text-sm text-[--gray-500]">
            촬영 RAID HDD 파일 인덱스를 탐색합니다.
          </p>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 오류 메시지 */}
        {errorSets && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {errorSets}
          </div>
        )}

        {/* 로딩 */}
        {loadingSets ? (
          <div className="text-sm text-[--gray-400]">HDD 목록 불러오는 중...</div>
        ) : hddSets.length === 0 ? (
          /* 스캔된 HDD 없음 안내 */
          <div className="rounded-2xl border border-[--border] bg-white p-12 text-center">
            <div className="text-5xl mb-4">💿</div>
            <p className="text-[--gray-600] text-sm leading-relaxed">
              스캔된 HDD가 없습니다.
              <br />
              HDD를 연결한 후 터미널에서 아래 명령어를 실행하세요.
            </p>
            <code className="mt-4 inline-block rounded-lg bg-[--gray-100] px-4 py-2 text-xs font-mono text-[--gray-700]">
              python3 scan_hdd.py /Volumes/WD_RAID &quot;25 레이드&quot;
            </code>
          </div>
        ) : (
          <>
            {/* HDD 세트 탭 + 검색창 */}
            <div className="flex items-end justify-between border-b border-[--border] mb-5">
              <div className="flex items-end gap-0">
                {hddSets.map((set) => (
                  <button
                    key={set.id}
                    onClick={() => switchSet(set.id)}
                    className={`px-5 py-3 text-[14px] font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
                      selectedSetId === set.id
                        ? 'border-black text-black'
                        : 'border-transparent text-gray-400 hover:text-black'
                    }`}
                  >
                    {set.name}
                  </button>
                ))}
              </div>
              {/* 검색창 */}
              <div className="pb-2.5">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="전체 레이드 검색..."
                    className="h-9 w-[220px] pl-8 pr-3 border border-[--border] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/10"
                  />
                  <svg
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[--gray-400]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  {isSearching && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[--gray-400]">
                      검색 중...
                    </span>
                  )}
                </div>
              </div>
            </div>

            {selectedSet && (
              <div className="flex flex-col gap-4">
                {/* 브레드크럼 (하위 폴더 탐색 중일 때만 표시) */}
                {!isSearchMode && currentPath && (
                  <nav className="flex items-center gap-1 text-sm flex-wrap min-h-[28px]">
                    {breadcrumbs.map((crumb, idx) => {
                      const isLast = idx === breadcrumbs.length - 1;
                      return (
                        <span key={crumb.path + String(idx)} className="flex items-center gap-1">
                          {idx > 0 && (
                            <span className="text-[--gray-300] select-none">/</span>
                          )}
                          {isLast ? (
                            <span className="font-semibold text-black">{crumb.label}</span>
                          ) : (
                            <button
                              onClick={() => navigateTo(crumb.path)}
                              className="text-[--gray-500] hover:text-black transition-colors"
                            >
                              {crumb.label}
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </nav>
                )}

                {/* 검색 모드 헤더 */}
                {isSearchMode && (
                  <div className="flex items-center gap-3 min-h-[28px]">
                    <span className="text-sm text-[--gray-600]">
                      &ldquo;{searchQuery}&rdquo; 검색 결과 — 전체 레이드 {displayedEntries.length}개
                      {displayedEntries.length === 200 && ' (최대 200개 표시)'}
                    </span>
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setSearchResults(null);
                      }}
                      className="text-xs text-[--gray-500] hover:text-black border border-[--border] rounded-lg px-2.5 py-1 transition-colors"
                    >
                      검색 지우기
                    </button>
                  </div>
                )}

                {/* 파일 목록 테이블 */}
                <div className="bg-white border border-[--border] rounded-2xl overflow-hidden shadow-sm">
                  {errorEntries && (
                    <div className="px-4 py-3 text-sm text-red-600 border-b border-[--border] bg-red-50">
                      {errorEntries}
                    </div>
                  )}

                  {loadingEntries ? (
                    <div className="px-6 py-10 text-sm text-[--gray-400]">불러오는 중...</div>
                  ) : displayedEntries.length === 0 ? (
                    <div className="px-6 py-10 text-sm text-[--gray-400]">
                      {isSearchMode ? '검색 결과가 없습니다.' : '항목이 없습니다.'}
                    </div>
                  ) : (
                    <table className="w-full text-sm table-fixed">
                      {/* 테이블 헤더 */}
                      <thead className="text-xs text-[--gray-400] uppercase bg-[--gray-50] border-b border-[--border]">
                        <tr>
                          <th className="px-4 py-2.5 text-left font-medium">
                            <button
                              onClick={() => handleSort('name')}
                              className="flex items-center gap-1 hover:text-black transition-colors"
                            >
                              이름
                              <SortIcon field="name" sortField={sortField} sortDir={sortDir} />
                            </button>
                          </th>
                          <th className="w-[80px] px-4 py-2.5 text-right font-medium hidden sm:table-cell">
                            <button
                              onClick={() => handleSort('extension')}
                              className="flex items-center justify-end gap-1 w-full hover:text-black transition-colors"
                            >
                              종류
                              <SortIcon field="extension" sortField={sortField} sortDir={sortDir} />
                            </button>
                          </th>
                          <th className="w-[110px] px-4 py-2.5 text-right font-medium hidden md:table-cell">
                            <button
                              onClick={() => handleSort('size_bytes')}
                              className="flex items-center justify-end gap-1 w-full hover:text-black transition-colors"
                            >
                              크기
                              <SortIcon field="size_bytes" sortField={sortField} sortDir={sortDir} />
                            </button>
                          </th>
                          <th className="w-[150px] px-4 py-2.5 text-right font-medium hidden lg:table-cell">
                            <button
                              onClick={() => handleSort('modified_at')}
                              className="flex items-center justify-end gap-1 w-full hover:text-black transition-colors"
                            >
                              수정일
                              <SortIcon field="modified_at" sortField={sortField} sortDir={sortDir} />
                            </button>
                          </th>
                          {isSearchMode && (
                            <th className="w-[80px] px-4 py-2.5 text-left font-medium hidden lg:table-cell">
                              레이드
                            </th>
                          )}
                          {isSearchMode && (
                            <th className="w-[220px] px-4 py-2.5 text-left font-medium hidden xl:table-cell">
                              경로
                            </th>
                          )}
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-[--border]">
                        {displayedEntries.map((entry) => (
                          <tr
                            key={entry.id}
                            className={`transition-colors ${
                              entry.is_dir
                                ? 'cursor-pointer hover:bg-[--gray-50]'
                                : 'hover:bg-[--gray-50]/60'
                            }`}
                            onClick={() => {
                              if (entry.is_dir) navigateTo(entry.path, entry.hdd_set_id);
                            }}
                          >
                            {/* 이름 셀 */}
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2.5 min-w-0">
                                {/* 아이콘 */}
                                {entry.is_dir ? (
                                  <svg
                                    className="w-[18px] h-[18px] flex-shrink-0 text-amber-400"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z" />
                                  </svg>
                                ) : (
                                  <svg
                                    className={`w-[18px] h-[18px] flex-shrink-0 ${getFileColor(entry.extension)}`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={1.5}
                                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                    />
                                  </svg>
                                )}
                                {/* 이름 */}
                                <span
                                  className={`truncate ${
                                    entry.is_dir
                                      ? 'font-medium text-black'
                                      : 'text-[--gray-800]'
                                  }`}
                                >
                                  {entry.name}
                                </span>
                              </div>
                            </td>

                            {/* 종류 */}
                            <td className="px-4 py-2.5 text-right hidden sm:table-cell">
                              {entry.is_dir ? (
                                <span className="text-xs text-[--gray-400]">폴더</span>
                              ) : (
                                <span
                                  className={`text-xs font-mono font-semibold ${getFileColor(entry.extension)}`}
                                >
                                  {entry.extension ? entry.extension.toUpperCase() : '—'}
                                </span>
                              )}
                            </td>

                            {/* 크기 */}
                            <td className="px-4 py-2.5 text-right text-[--gray-500] hidden md:table-cell">
                              {formatSize(entry.size_bytes)}
                            </td>

                            {/* 수정일 */}
                            <td className="px-4 py-2.5 text-right text-[--gray-400] text-xs tabular-nums hidden lg:table-cell">
                              {formatDate(entry.modified_at)}
                            </td>

                            {/* 레이드 (검색 모드) */}
                            {isSearchMode && (
                              <td className="px-4 py-2.5 hidden lg:table-cell">
                                <span className="text-xs font-semibold text-[--gray-500] bg-[--gray-100] px-2 py-0.5 rounded-md">
                                  {getSetName(entry.hdd_set_id)}
                                </span>
                              </td>
                            )}

                            {/* 경로 (검색 모드) */}
                            {isSearchMode && (
                              <td className="px-4 py-2.5 hidden xl:table-cell">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigateTo(entry.parent_path, entry.hdd_set_id);
                                  }}
                                  className="text-xs text-[--gray-400] hover:text-black font-mono truncate max-w-[200px] block text-left transition-colors"
                                  title={entry.parent_path || '/'}
                                >
                                  {entry.parent_path || '/'}
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                {/* 항목 수 표시 */}
                {!loadingEntries && displayedEntries.length > 0 && (
                  <p className="text-xs text-[--gray-400] text-right">
                    {displayedEntries.length.toLocaleString()} 개 항목
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
