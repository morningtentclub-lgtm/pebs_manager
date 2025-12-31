'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Project } from '@/lib/types';
import Link from 'next/link';

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'ongoing' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', client: '' });

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const normalized = (data || []).map((project) => ({
        ...project,
        status: project.status === 'pending' ? 'ongoing' : project.status,
      }));
      setProjects(normalized);
    } catch (error) {
      console.error('프로젝트 목록 불러오기 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const createProject = async () => {
    if (!newProject.name.trim()) return;

    try {
      const { error } = await supabase
        .from('projects')
        .insert([{
          name: newProject.name,
          client: newProject.client || null,
          status: 'ongoing'
        }]);

      if (error) throw error;

      setNewProject({ name: '', client: '' });
      setShowNewProjectForm(false);
      fetchProjects();
    } catch (error) {
      console.error('프로젝트 생성 실패:', error);
    }
  };

  const filteredProjects = projects.filter(project => {
    const matchesFilter = filter === 'all' || project.status === filter;
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (project.client?.toLowerCase().includes(searchQuery.toLowerCase()) || false);
    return matchesFilter && matchesSearch;
  });

  const sortedProjects = [...filteredProjects].sort((a, b) => {
    const aGroup = a.status === 'completed' ? 1 : 0;
    const bGroup = b.status === 'completed' ? 1 : 0;
    if (aGroup !== bGroup) return aGroup - bGroup;
    const aTime = new Date(a.updated_at || a.created_at).getTime();
    const bTime = new Date(b.updated_at || b.created_at).getTime();
    return bTime - aTime;
  });

  const stats = {
    total: projects.length,
    ongoing: projects.filter(p => p.status !== 'completed').length,
    completed: projects.filter(p => p.status === 'completed').length,
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <div className="bg-[--gray-50] border-b border-[--border]">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-[32px] font-bold mb-2 tracking-tight">프로젝트</h1>
              <p className="text-[15px] text-gray-600">진행 중인 계약금 지급 프로젝트를 관리하세요</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:justify-end lg:gap-4">
              <div className="flex flex-wrap items-center gap-2">
                {(['all', 'ongoing', 'completed'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilter(status)}
                    className={`px-4 py-2 text-[14px] font-semibold rounded-lg transition-all ${
                      filter === status
                        ? 'bg-black text-white border border-black'
                        : 'bg-white text-gray-600 border border-gray-200 hover:border-black'
                    }`}
                  >
                    {status === 'all' && `전체 ${stats.total}`}
                    {status === 'ongoing' && `진행 중 ${stats.ongoing}`}
                    {status === 'completed' && `완료 ${stats.completed}`}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowNewProjectForm(true)}
                className="px-6 py-3 bg-black text-white text-[14px] font-semibold rounded-lg hover:bg-[--primary-light] transition-colors"
              >
                새 프로젝트 등록
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <div className="flex items-center justify-end mb-6">
          <div className="relative w-[280px]">
            <input
              type="text"
              placeholder="프로젝트 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2.5 text-[14px] border border-[--border] rounded-lg focus:outline-none focus:border-black transition-colors"
            />
            <svg
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Project Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-[14px] text-gray-500">로딩 중...</div>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-[--gray-50] rounded-lg border border-[--border]">
            <div className="text-[15px] text-gray-500 mb-2">프로젝트가 없습니다</div>
            <button
              onClick={() => setShowNewProjectForm(true)}
              className="text-[14px] font-semibold text-black hover:underline"
            >
              새 프로젝트 등록하기
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedProjects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group bg-white rounded-lg border border-[--border] hover:border-black transition-all p-6"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-[16px] font-bold flex-1 group-hover:underline">{project.name}</h3>
                  <span className={`ml-2 px-2.5 py-1 text-[11px] font-bold rounded ${
                    project.status === 'completed'
                      ? 'bg-green-50 text-[--success]'
                      : 'bg-red-50 text-[--accent]'
                  }`}>
                    {project.status === 'completed' ? '완료' : '진행 중'}
                  </span>
                </div>

                {project.client && (
                  <div className="text-[14px] text-gray-600 mb-3">{project.client}</div>
                )}

                <div className="text-[13px] text-gray-400">
                  {new Date(project.created_at).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* New Project Modal */}
      {showNewProjectForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-8">
            <h2 className="text-[24px] font-bold mb-6">새 프로젝트 등록</h2>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-[13px] font-semibold text-gray-700 mb-2">
                  프로젝트명 *
                </label>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  className="w-full px-4 py-3 text-[14px] border border-[--border] rounded-lg focus:outline-none focus:border-black"
                  placeholder="프로젝트 이름 입력"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-gray-700 mb-2">
                  클라이언트
                </label>
                <input
                  type="text"
                  value={newProject.client}
                  onChange={(e) => setNewProject({ ...newProject, client: e.target.value })}
                  className="w-full px-4 py-3 text-[14px] border border-[--border] rounded-lg focus:outline-none focus:border-black"
                  placeholder="클라이언트 이름 입력 (선택)"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowNewProjectForm(false);
                  setNewProject({ name: '', client: '' });
                }}
                className="flex-1 px-4 py-3 text-[14px] font-semibold bg-white border border-[--border] rounded-lg hover:bg-[--gray-50] transition-colors"
              >
                취소
              </button>
              <button
                onClick={createProject}
                disabled={!newProject.name.trim()}
                className="flex-1 px-4 py-3 text-[14px] font-semibold bg-black text-white rounded-lg hover:bg-[--primary-light] transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                등록
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
