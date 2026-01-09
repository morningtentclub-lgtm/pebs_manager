'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type PlanetStatus = 'explored' | 'unexplored';

type StaffPlanetMember = {
  id: string;
  name: string;
  status: PlanetStatus;
  notes: string | null;
  portfolio_url: string | null;
  created_at: string;
  updated_at: string;
};

type StaffPlanetProject = {
  id: string;
  member_id: string;
  project_name: string;
  estimate: number | null;
  contact: string | null;
  created_at: string;
};

type ProjectDraft = {
  id?: string;
  project_name: string;
  estimate: string;
  contact: string;
};

const PLANET_LABELS: Record<PlanetStatus, { title: string; subtitle: string }> = {
  explored: { title: '개척 행성', subtitle: '이미 함께한 스탭' },
  unexplored: { title: '미개척 행성', subtitle: '새롭게 만나고 싶은 스탭' },
};

const formatAmount = (value: number | null | undefined) =>
  typeof value === 'number' ? `${value.toLocaleString()}원` : '-';

export default function StaffPlanetPage() {
  const hidePage = true;
  const router = useRouter();
  const [members, setMembers] = useState<StaffPlanetMember[]>([]);
  const [projects, setProjects] = useState<StaffPlanetProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [activePlanet, setActivePlanet] = useState<PlanetStatus>('explored');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingMember, setEditingMember] = useState<StaffPlanetMember | null>(null);
  const [draft, setDraft] = useState({
    name: '',
    status: 'explored' as PlanetStatus,
    notes: '',
    portfolio_url: '',
  });
  const [projectDrafts, setProjectDrafts] = useState<ProjectDraft[]>([]);

  const loadData = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [{ data: memberData, error: memberError }, { data: projectData, error: projectError }] =
        await Promise.all([
          supabase
            .from('staff_planet_members')
            .select('*')
            .order('created_at', { ascending: false }),
          supabase
            .from('staff_planet_projects')
            .select('*')
            .order('created_at', { ascending: false }),
        ]);

      if (memberError) throw memberError;
      if (projectError) throw projectError;

      setMembers((memberData || []) as StaffPlanetMember[]);
      setProjects((projectData || []) as StaffPlanetProject[]);
    } catch (error) {
      console.error('스탭 플래닛 데이터 불러오기 실패:', error);
      setErrorMessage('스탭 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hidePage) {
      router.replace('/');
      return;
    }
    loadData();
  }, [hidePage, router]);

  const exploredMembers = useMemo(
    () => members.filter((member) => member.status === 'explored'),
    [members]
  );
  const unexploredMembers = useMemo(
    () => members.filter((member) => member.status === 'unexplored'),
    [members]
  );
  const activeMembers = activePlanet === 'explored' ? exploredMembers : unexploredMembers;

  const projectsByMember = useMemo(() => {
    const map = new Map<string, StaffPlanetProject[]>();
    projects.forEach((project) => {
      const list = map.get(project.member_id) ?? [];
      list.push(project);
      map.set(project.member_id, list);
    });
    return map;
  }, [projects]);

  const activeMember = useMemo(() => {
    if (!activeMembers.length) return null;
    if (selectedMemberId) {
      const target = activeMembers.find((member) => member.id === selectedMemberId);
      if (target) return target;
    }
    return activeMembers[0];
  }, [activeMembers, selectedMemberId]);

  useEffect(() => {
    if (!activeMember) {
      setSelectedMemberId(null);
      return;
    }
    if (activeMember.id !== selectedMemberId) {
      setSelectedMemberId(activeMember.id);
    }
  }, [activeMember, selectedMemberId]);

  const orbitPositions = useMemo(() => {
    if (activeMembers.length === 0) return [];
    const radius = activeMembers.length > 8 ? 180 : 160;
    return activeMembers.map((member, index) => {
      const angle = (index / activeMembers.length) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      return { member, x, y };
    });
  }, [activeMembers]);

  const openEditor = (member?: StaffPlanetMember) => {
    if (member) {
      setEditingMember(member);
      setDraft({
        name: member.name,
        status: member.status,
        notes: member.notes || '',
        portfolio_url: member.portfolio_url || '',
      });
      const existingProjects = projectsByMember.get(member.id) || [];
      setProjectDrafts(
        existingProjects.map((project) => ({
          id: project.id,
          project_name: project.project_name,
          estimate: project.estimate?.toString() || '',
          contact: project.contact || '',
        }))
      );
    } else {
      setEditingMember(null);
      setDraft({ name: '', status: 'explored', notes: '', portfolio_url: '' });
      setProjectDrafts([]);
    }
    setShowEditor(true);
  };

  const closeEditor = () => {
    setShowEditor(false);
    setEditingMember(null);
    setDraft({ name: '', status: 'explored', notes: '', portfolio_url: '' });
    setProjectDrafts([]);
  };

  const addProjectDraft = () => {
    setProjectDrafts((prev) => [...prev, { project_name: '', estimate: '', contact: '' }]);
  };

  const updateProjectDraft = (index: number, field: keyof ProjectDraft, value: string) => {
    setProjectDrafts((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
    );
  };

  const removeProjectDraft = (index: number) => {
    setProjectDrafts((prev) => prev.filter((_, idx) => idx !== index));
  };

  const saveMember = async () => {
    if (!draft.name.trim()) return;
    try {
      const payload = {
        name: draft.name.trim(),
        status: draft.status,
        notes: draft.notes.trim() || null,
        portfolio_url: draft.portfolio_url.trim() || null,
        updated_at: new Date().toISOString(),
      };

      let memberId = editingMember?.id;
      if (editingMember) {
        const { error } = await supabase
          .from('staff_planet_members')
          .update(payload)
          .eq('id', editingMember.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('staff_planet_members')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        memberId = data?.id;
      }

      if (memberId) {
        const { error: deleteError } = await supabase
          .from('staff_planet_projects')
          .delete()
          .eq('member_id', memberId);
        if (deleteError) throw deleteError;

        if (draft.status === 'explored') {
          const rows = projectDrafts
            .filter((item) => item.project_name.trim())
            .map((item) => ({
              member_id: memberId,
              project_name: item.project_name.trim(),
              estimate: item.estimate ? Number(item.estimate.replace(/[^0-9]/g, '')) : null,
              contact: item.contact.trim() || null,
            }));
          if (rows.length > 0) {
            const { error: insertError } = await supabase
              .from('staff_planet_projects')
              .insert(rows);
            if (insertError) throw insertError;
          }
        }
      }

      closeEditor();
      loadData();
    } catch (error) {
      console.error('스탭 정보 저장 실패:', error);
      alert('스탭 정보를 저장하지 못했습니다.');
    }
  };

  const deleteMember = async () => {
    if (!editingMember) return;
    if (!confirm('이 스탭 정보를 삭제할까요?')) return;
    try {
      const { error } = await supabase
        .from('staff_planet_members')
        .delete()
        .eq('id', editingMember.id);
      if (error) throw error;
      closeEditor();
      loadData();
    } catch (error) {
      console.error('스탭 정보 삭제 실패:', error);
      alert('스탭 정보를 삭제하지 못했습니다.');
    }
  };

  const planetStyle = (status: PlanetStatus, isActive: boolean) => {
    const base =
      status === 'explored'
        ? 'radial-gradient(circle at 30% 30%, #ffffff 0%, #d9dbe1 48%, #a9afba 100%)'
        : 'radial-gradient(circle at 40% 30%, #ffffff 0%, #e6e8ee 55%, #b5bac4 100%)';
    return {
      background: base,
      width: isActive ? 360 : 160,
      height: isActive ? 360 : 160,
      boxShadow: isActive
        ? '0 0 120px rgba(255, 255, 255, 0.16), 0 40px 80px rgba(0, 0, 0, 0.4)'
        : '0 0 50px rgba(255, 255, 255, 0.12), 0 20px 40px rgba(0, 0, 0, 0.35)',
    };
  };

  if (hidePage) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-[--gray-50] border-b border-[--border]">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-[32px] font-bold tracking-tight">STAFF PLANET</h1>
              <p className="text-[15px] text-gray-600 mt-2">
                함께한 스탭과 앞으로의 협업 후보를 행성으로 관리합니다.
              </p>
            </div>
            <button
              onClick={() => openEditor()}
              className="px-5 py-2.5 bg-black text-white text-[14px] font-semibold rounded-lg hover:bg-[--primary-light] transition-colors"
            >
              스탭 추가
            </button>
          </div>
        </div>
      </div>

      <div className="relative bg-black text-white overflow-hidden">
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.12) 0%, transparent 32%), radial-gradient(circle at 80% 30%, rgba(255,255,255,0.1) 0%, transparent 38%), radial-gradient(circle at 30% 70%, rgba(255,255,255,0.08) 0%, transparent 40%), radial-gradient(circle at 70% 75%, rgba(255,255,255,0.1) 0%, transparent 36%)',
            backgroundSize: '1200px 900px',
          }}
        />
        <div className="absolute inset-0 opacity-60" style={{
          backgroundImage:
            'radial-gradient(circle, rgba(255,255,255,0.3) 1px, transparent 1px)',
          backgroundSize: '140px 140px',
        }} />

        <div className="relative max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-16">
          {loading ? (
            <div className="text-[14px] text-gray-300">로딩 중...</div>
          ) : errorMessage ? (
            <div className="bg-white/10 border border-white/20 rounded-lg p-4 text-[14px] text-red-200">
              {errorMessage}
            </div>
          ) : (
            <div>
              <div className="relative min-h-[520px] lg:min-h-[620px]">
                {(['explored', 'unexplored'] as PlanetStatus[]).map((status) => {
                  const isActive = activePlanet === status;
                  const position = isActive ? '50%' : '82%';
                  return (
                    <button
                      key={status}
                      onClick={() => setActivePlanet(status)}
                      className={`absolute top-[38%] -translate-y-1/2 rounded-full border border-white/20 transition-all duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
                        isActive ? 'z-20' : 'z-10 opacity-70 hover:opacity-100'
                      }`}
                      style={{
                        left: position,
                        transform: 'translate(-50%, -50%)',
                        ...planetStyle(status, isActive),
                      }}
                    >
                      {isActive && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center text-gray-900">
                            <div className="text-[16px] font-semibold">{PLANET_LABELS[status].title}</div>
                            <div className="text-[12px] text-gray-600">{PLANET_LABELS[status].subtitle}</div>
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}

                <div className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] rounded-full border border-white/15" />

                {orbitPositions.map(({ member, x, y }) => {
                  const isSelected = member.id === selectedMemberId;
                  const adjusted = isSelected ? { x: 0, y: 0 } : { x, y };
                  return (
                    <button
                      key={member.id}
                      onClick={() => setSelectedMemberId(member.id)}
                      className={`absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ${
                        isSelected ? 'z-30' : 'z-20'
                      }`}
                      style={{
                        transform: `translate(-50%, -50%) translate(${adjusted.x}px, ${adjusted.y}px)`,
                      }}
                    >
                      <div
                        className={`px-3 py-1 rounded-full text-[12px] font-semibold border ${
                          isSelected
                            ? 'bg-white text-black border-white scale-110'
                            : 'bg-white/10 text-gray-200 border-white/20'
                        }`}
                      >
                        {member.name}
                      </div>
                    </button>
                  );
                })}

                {activeMember && (
                  <div className="absolute left-1/2 top-[38%] translate-y-[210px] -translate-x-1/2 text-center">
                    <div className="text-[12px] text-gray-300">{PLANET_LABELS[activeMember.status].title}</div>
                    <div className="text-[22px] font-bold">{activeMember.name}</div>
                  </div>
                )}
              </div>

              <div className="mt-10 max-w-3xl mx-auto text-center">
                {activeMember ? (
                  <>
                    {activeMember.notes && (
                      <div className="text-[14px] text-gray-200 leading-relaxed whitespace-pre-line">
                        {activeMember.notes}
                      </div>
                    )}
                    {activeMember.status === 'explored' ? (
                      <div className="mt-8 space-y-3 text-left">
                        <div className="text-[14px] font-semibold text-gray-200">함께한 프로젝트</div>
                        {(projectsByMember.get(activeMember.id) || []).length === 0 ? (
                          <div className="text-[13px] text-gray-400">등록된 프로젝트가 없습니다.</div>
                        ) : (
                          <div className="space-y-3">
                            {(projectsByMember.get(activeMember.id) || []).map((project) => (
                              <div key={project.id} className="rounded-xl border border-white/20 bg-white/5 p-4">
                                <div className="flex items-center justify-between">
                                  <div className="text-[15px] font-semibold text-white">{project.project_name}</div>
                                  <div className="text-[13px] text-gray-300">
                                    {formatAmount(project.estimate)}
                                  </div>
                                </div>
                                {project.contact && (
                                  <div className="mt-2 text-[13px] text-gray-400">{project.contact}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-8 space-y-3 text-left">
                        <div className="text-[14px] font-semibold text-gray-200">포트폴리오</div>
                        {activeMember.portfolio_url ? (
                          <a
                            className="text-[14px] text-white underline"
                            href={activeMember.portfolio_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {activeMember.portfolio_url}
                          </a>
                        ) : (
                          <div className="text-[13px] text-gray-400">등록된 링크가 없습니다.</div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-[14px] text-gray-300">선택된 스탭이 없습니다.</div>
                )}
                {activeMember && (
                  <div className="mt-6">
                    <button
                      onClick={() => openEditor(activeMember)}
                      className="px-4 py-2 text-[13px] font-semibold border border-white/30 rounded-lg hover:border-white"
                    >
                      정보 수정
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showEditor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[22px] font-bold">
                {editingMember ? '스탭 정보 수정' : '스탭 추가'}
              </h2>
              <button
                onClick={closeEditor}
                className="text-[13px] text-gray-500 hover:text-black"
              >
                닫기
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-[13px] font-semibold text-gray-700 mb-2">이름</label>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-3 text-[14px] border border-[--border] rounded-lg focus:outline-none focus:border-black"
                  placeholder="이름 입력"
                />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-gray-700 mb-2">행성 구분</label>
                <select
                  value={draft.status}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, status: e.target.value as PlanetStatus }))
                  }
                  className="w-full px-4 py-3 text-[14px] border border-[--border] rounded-lg focus:outline-none focus:border-black bg-white"
                >
                  <option value="explored">개척 행성</option>
                  <option value="unexplored">미개척 행성</option>
                </select>
              </div>
            </div>

            {draft.status === 'explored' ? (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[14px] font-semibold text-gray-700">함께한 프로젝트</div>
                  <button
                    onClick={addProjectDraft}
                    className="text-[13px] font-semibold text-black underline"
                  >
                    프로젝트 추가
                  </button>
                </div>
                <div className="space-y-3">
                  {projectDrafts.length === 0 && (
                    <div className="text-[13px] text-gray-400">프로젝트를 추가하세요.</div>
                  )}
                  {projectDrafts.map((item, index) => (
                    <div key={`${item.id || 'new'}-${index}`} className="rounded-xl border border-gray-200 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-[13px] font-semibold text-gray-500">프로젝트 {index + 1}</div>
                        <button
                          onClick={() => removeProjectDraft(index)}
                          className="text-[12px] text-gray-400 hover:text-black"
                        >
                          삭제
                        </button>
                      </div>
                      <input
                        value={item.project_name}
                        onChange={(e) => updateProjectDraft(index, 'project_name', e.target.value)}
                        className="w-full px-4 py-2.5 text-[14px] border border-[--border] rounded-lg focus:outline-none focus:border-black"
                        placeholder="프로젝트명"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          value={item.estimate}
                          onChange={(e) => updateProjectDraft(index, 'estimate', e.target.value)}
                          className="w-full px-4 py-2.5 text-[14px] border border-[--border] rounded-lg focus:outline-none focus:border-black"
                          placeholder="견적 (숫자)"
                        />
                        <input
                          value={item.contact}
                          onChange={(e) => updateProjectDraft(index, 'contact', e.target.value)}
                          className="w-full px-4 py-2.5 text-[14px] border border-[--border] rounded-lg focus:outline-none focus:border-black"
                          placeholder="컨택 포인트"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mb-6">
                <label className="block text-[13px] font-semibold text-gray-700 mb-2">포트폴리오 링크</label>
                <input
                  value={draft.portfolio_url}
                  onChange={(e) => setDraft((prev) => ({ ...prev, portfolio_url: e.target.value }))}
                  className="w-full px-4 py-3 text-[14px] border border-[--border] rounded-lg focus:outline-none focus:border-black"
                  placeholder="https://"
                />
              </div>
            )}

            <div className="mb-6">
              <label className="block text-[13px] font-semibold text-gray-700 mb-2">특징 / 비고</label>
              <textarea
                value={draft.notes}
                onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
                className="w-full min-h-[120px] px-4 py-3 text-[14px] border border-[--border] rounded-lg focus:outline-none focus:border-black"
                placeholder="자유롭게 입력하세요"
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
              {editingMember ? (
                <button
                  onClick={deleteMember}
                  className="text-[13px] text-red-500 font-semibold"
                >
                  스탭 삭제
                </button>
              ) : (
                <div />
              )}
              <div className="flex gap-3">
                <button
                  onClick={closeEditor}
                  className="px-5 py-2.5 text-[14px] font-semibold rounded-lg border border-gray-200 hover:border-black"
                >
                  취소
                </button>
                <button
                  onClick={saveMember}
                  className="px-5 py-2.5 text-[14px] font-semibold rounded-lg bg-black text-white hover:bg-[--primary-light]"
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
