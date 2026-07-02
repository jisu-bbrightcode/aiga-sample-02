import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  FileClock,
  LayoutDashboard,
  MessageSquareWarning,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from "lucide-react";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type QueueCard = {
  id: string;
  title: string;
  count: number;
  trend: string;
  tone: "green" | "amber" | "blue" | "red";
  icon: LucideIcon;
};

export type ReviewRow = {
  id: string;
  type: string;
  title: string;
  owner: string;
  age: string;
  status: "대기" | "검토중" | "보류";
};

export const adminNavItems: AdminNavItem[] = [
  { href: "/admin", label: "대시보드", icon: LayoutDashboard },
  { href: "/admin/content", label: "콘텐츠 관리", icon: FileClock },
  { href: "/admin/users", label: "사용자 관리", icon: Users },
  { href: "/admin/audit", label: "접근 기록", icon: ShieldCheck },
];

export const queueCards: QueueCard[] = [
  {
    id: "content",
    title: "콘텐츠 승인 대기",
    count: 18,
    trend: "오늘 6건 증가",
    tone: "amber",
    icon: FileClock,
  },
  {
    id: "doctors",
    title: "의사 인증 검토",
    count: 7,
    trend: "평균 처리 2.4시간",
    tone: "blue",
    icon: BadgeCheck,
  },
  {
    id: "reports",
    title: "신고 확인 필요",
    count: 4,
    trend: "긴급 1건 포함",
    tone: "red",
    icon: MessageSquareWarning,
  },
  {
    id: "members",
    title: "회원 등급 변경",
    count: 12,
    trend: "자동 승인 9건",
    tone: "green",
    icon: UserRoundCheck,
  },
];

export const reviewRows: ReviewRow[] = [
  {
    id: "review-1024",
    type: "콘텐츠",
    title: "AI 의료 상담 가이드 업데이트",
    owner: "콘텐츠팀",
    age: "12분 전",
    status: "대기",
  },
  {
    id: "review-1023",
    type: "인증",
    title: "전문의 면허 인증 자료",
    owner: "김지훈",
    age: "28분 전",
    status: "검토중",
  },
  {
    id: "review-1022",
    type: "신고",
    title: "커뮤니티 게시글 신고",
    owner: "운영 정책",
    age: "44분 전",
    status: "보류",
  },
];
