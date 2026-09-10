'use client';

import Link from 'next/link';
import type { Project } from '@/lib/types';

type Props = {
  project: Project;
  selectionMode: boolean;
  selected: boolean;
  onToggle: (projectId: string) => void;
};

export default function ProjectCard({ project, selectionMode, selected, onToggle }: Props) {
  const body = (
    <>
      <div className="flex items-start justify-between mb-3">
        <h3 className={`text-[16px] font-bold flex-1 break-words ${selectionMode ? '' : 'group-hover:underline'}`}>
          {project.name}
        </h3>
        <span
          className={`ml-2 px-2.5 py-1 text-[11px] font-bold rounded shrink-0 ${
            project.status === 'completed' ? 'bg-green-50 text-[--success]' : 'bg-red-50 text-[--accent]'
          }`}
        >
          {project.status === 'completed' ? '완료' : '진행 중'}
        </span>
      </div>

      {project.client && <div className="text-[14px] text-gray-600 mb-3">{project.client}</div>}

      <div className="text-[13px] text-gray-400">
        {new Date(project.created_at).toLocaleDateString('ko-KR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </div>
    </>
  );

  const frame = `relative bg-white rounded-lg border transition-all ${
    selected ? 'border-black ring-1 ring-black' : 'border-[--border] hover:border-black'
  }`;

  // 선택 모드에서는 카드 어디를 눌러도 상세로 가지 않고 선택만 토글된다
  if (selectionMode) {
    return (
      <div className={frame} data-testid="project-card">
        <button
          type="button"
          aria-pressed={selected}
          aria-label={`${project.name} 선택`}
          onClick={() => onToggle(project.id)}
          className="block w-full text-left p-6 pl-12 cursor-pointer"
        >
          {body}
        </button>
        <span className="absolute top-5 left-5 p-1 pointer-events-none">
          <input
            type="checkbox"
            tabIndex={-1}
            aria-hidden="true"
            checked={selected}
            readOnly
            className="h-4 w-4 rounded border-[--border-dark] accent-black"
          />
        </span>
      </div>
    );
  }

  return (
    <div className={frame} data-testid="project-card">
      <Link href={`/projects/${project.id}`} className="group block p-6">
        {body}
      </Link>
    </div>
  );
}
