import {
  Bell,
  BookOpen,
  Bookmark,
  ChevronRight,
  CheckCircle2,
  LogIn,
  LogOut,
  MessageCircle,
  PencilLine,
  PlayCircle,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import {
  createContext,
  FormEvent,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { adminNavItems, queueCards, reviewRows } from "./adminData";
import {
  type AdminSession,
  clearAdminSession,
  getAdminSession,
  signInAdmin,
} from "./auth";

type AppRoute = {
  path: string;
  view: "login" | "dashboard" | "content" | "users" | "audit" | "notFound";
};

function getRoute(pathname: string): AppRoute {
  if (pathname === "/" || pathname === "/admin") {
    return { path: "/admin", view: "dashboard" };
  }

  if (pathname === "/admin/login") {
    return { path: "/admin/login", view: "login" };
  }

  if (pathname === "/admin/content") {
    return { path: "/admin/content", view: "content" };
  }

  if (pathname === "/admin/users") {
    return { path: "/admin/users", view: "users" };
  }

  if (pathname === "/admin/audit") {
    return { path: "/admin/audit", view: "audit" };
  }

  return { path: pathname, view: "notFound" };
}

function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

type PublicRoute = {
  path: string;
  view: "home" | "browse" | "community" | "write" | "mypage" | "notFound";
};

type PublicUser = {
  email: string;
  name: string;
};

type PendingAction = {
  label: string;
  resume: () => void;
};

type PublicAuthContextValue = {
  user: PublicUser | null;
  pendingAction: PendingAction | null;
  closeAuthModal: () => void;
  login: (email: string) => void;
  logout: () => void;
  requestAuth: (label: string, resume: () => void) => void;
};

const PublicAuthContext = createContext<PublicAuthContextValue | null>(null);

const contentItems = [
  {
    title: "인공지능 임상 세미나",
    category: "Live",
    summary: "전문의가 정리한 AI 진료 보조 사례와 실제 적용 체크리스트",
    meta: "오늘 19:00 · 48명 참여",
  },
  {
    title: "전공의 케이스 노트",
    category: "Guide",
    summary: "수련 단계별로 다시 보는 필수 감별 진단과 처방 흐름",
    meta: "신규 12개 노트",
  },
  {
    title: "면허 인증 커뮤니티",
    category: "Forum",
    summary: "검증된 의료진만 참여하는 질문, 답변, 자료 공유 공간",
    meta: "최근 답변 32개",
  },
];

function getPublicRoute(pathname: string): PublicRoute {
  if (pathname === "/") {
    return { path: "/", view: "home" };
  }

  if (pathname === "/browse") {
    return { path: "/browse", view: "browse" };
  }

  if (pathname === "/community") {
    return { path: "/community", view: "community" };
  }

  if (pathname === "/write") {
    return { path: "/write", view: "write" };
  }

  if (pathname === "/mypage") {
    return { path: "/mypage", view: "mypage" };
  }

  return { path: pathname, view: "notFound" };
}

function usePublicAuth() {
  const value = useContext(PublicAuthContext);

  if (!value) {
    throw new Error("usePublicAuth must be used inside PublicAuthProvider");
  }

  return value;
}

function PublicAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const requestAuth = useCallback(
    (label: string, resume: () => void) => {
      if (user) {
        resume();
        return;
      }

      setPendingAction({ label, resume });
    },
    [user],
  );

  const closeAuthModal = useCallback(() => setPendingAction(null), []);

  const login = useCallback(
    (email: string) => {
      const action = pendingAction;
      const normalizedEmail = email.trim() || "doctor@aiga.test";
      const name = normalizedEmail.split("@")[0] || "Aiga user";

      setUser({ email: normalizedEmail, name });
      setPendingAction(null);

      if (action) {
        action.resume();
      }
    },
    [pendingAction],
  );

  const logout = useCallback(() => setUser(null), []);

  const value = useMemo(
    () => ({
      user,
      pendingAction,
      closeAuthModal,
      login,
      logout,
      requestAuth,
    }),
    [closeAuthModal, login, logout, pendingAction, requestAuth, user],
  );

  return (
    <PublicAuthContext.Provider value={value}>
      {children}
      {pendingAction ? <AuthModal /> : null}
    </PublicAuthContext.Provider>
  );
}

function AdminApp() {
  const [route, setRoute] = useState(() => getRoute(window.location.pathname));
  const [session, setSession] = useState<AdminSession | null>(() => getAdminSession());

  useEffect(() => {
    const handleRouteChange = () => setRoute(getRoute(window.location.pathname));
    window.addEventListener("popstate", handleRouteChange);

    return () => window.removeEventListener("popstate", handleRouteChange);
  }, []);

  useEffect(() => {
    if (route.view !== "login" && !session) {
      const returnTo = route.path === "/admin" ? "" : `?returnTo=${encodeURIComponent(route.path)}`;
      navigate(`/admin/login${returnTo}`);
      return;
    }

    if (route.view === "login" && session) {
      const params = new URLSearchParams(window.location.search);
      navigate(params.get("returnTo") || "/admin");
    }
  }, [route, session]);

  if (route.view === "login") {
    return (
      <AdminLogin
        onSignedIn={(nextSession) => {
          setSession(nextSession);
        }}
      />
    );
  }

  if (!session) {
    return <PageLoading />;
  }

  return (
    <AdminShell
      route={route}
      session={session}
      onLogout={() => {
        clearAdminSession();
        setSession(null);
        navigate("/admin/login");
      }}
    />
  );
}

function AdminLogin({ onSignedIn }: { onSignedIn: (session: AdminSession) => void }) {
  const [email, setEmail] = useState("admin@aiga.test");
  const [password, setPassword] = useState("admin1234");
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextSession = signInAdmin(email, password);

    if (!nextSession) {
      setError("관리자 계정 정보를 확인해 주세요.");
      return;
    }

    setError("");
    onSignedIn(nextSession);
  };

  return (
    <main className="login-screen">
      <section className="login-panel" aria-labelledby="admin-login-title">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          <div>
            <p>Aiga</p>
            <h1 id="admin-login-title">관리자 로그인</h1>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            이메일
            <input
              autoComplete="username"
              inputMode="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            비밀번호
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" type="submit">
            <ShieldCheck size={18} aria-hidden="true" />
            관리자 콘솔로 이동
          </button>
        </form>
      </section>
    </main>
  );
}

function AdminShell({
  route,
  session,
  onLogout,
}: {
  route: AppRoute;
  session: AdminSession;
  onLogout: () => void;
}) {
  const pageTitle = useMemo(() => {
    const activeItem = adminNavItems.find((item) => item.href === route.path);
    return activeItem?.label || "관리자";
  }, [route.path]);

  return (
    <div className="admin-shell">
      <aside className="sidebar" aria-label="관리자 메뉴">
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          <div>
            <p>Aiga</p>
            <strong>Admin</strong>
          </div>
        </div>

        <nav className="sidebar-nav">
          {adminNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === route.path;

            return (
              <button
                className={isActive ? "nav-item active" : "nav-item"}
                key={item.href}
                onClick={() => navigate(item.href)}
                type="button"
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">운영 콘솔</p>
            <h1>{pageTitle}</h1>
          </div>

          <div className="topbar-actions">
            <label className="search-control" aria-label="관리 항목 검색">
              <Search size={17} aria-hidden="true" />
              <input placeholder="검색" type="search" />
            </label>
            <button className="icon-button" type="button" aria-label="알림">
              <Bell size={18} aria-hidden="true" />
            </button>
            <div className="admin-profile">
              <UserRound size={17} aria-hidden="true" />
              <span>{session.name}</span>
            </div>
            <button className="ghost-button" type="button" onClick={onLogout}>
              <LogOut size={17} aria-hidden="true" />
              로그아웃
            </button>
          </div>
        </header>

        <main className="page-content">
          {route.view === "dashboard" ? <Dashboard /> : null}
          {route.view === "content" ? <PlaceholderPage title="콘텐츠 관리" /> : null}
          {route.view === "users" ? <PlaceholderPage title="사용자 관리" /> : null}
          {route.view === "audit" ? <PlaceholderPage title="접근 기록" /> : null}
          {route.view === "notFound" ? <PlaceholderPage title="페이지를 찾을 수 없습니다" /> : null}
        </main>
      </div>
    </div>
  );
}

function Dashboard() {
  return (
    <div className="dashboard-grid">
      <section className="dashboard-section metrics-section" aria-labelledby="queue-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">처리 대기</p>
            <h2 id="queue-title">오늘의 운영 큐</h2>
          </div>
          <button className="ghost-button compact" type="button">
            전체 보기
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="metric-grid">
          {queueCards.map((card) => {
            const Icon = card.icon;

            return (
              <article className={`metric-card ${card.tone}`} key={card.id}>
                <div className="metric-icon" aria-hidden="true">
                  <Icon size={20} />
                </div>
                <div>
                  <p>{card.title}</p>
                  <strong>{card.count}</strong>
                  <span>{card.trend}</span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="dashboard-section review-section" aria-labelledby="review-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">우선순위</p>
            <h2 id="review-title">최근 검토 항목</h2>
          </div>
        </div>

        <div className="review-list" role="list">
          {reviewRows.map((row) => (
            <article className="review-row" key={row.id} role="listitem">
              <div>
                <span className="row-type">{row.type}</span>
                <strong>{row.title}</strong>
                <p>
                  {row.owner} · {row.age}
                </p>
              </div>
              <span className={`status-pill ${row.status}`}>{row.status}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <section className="placeholder-page" aria-labelledby="placeholder-title">
      <ShieldCheck size={30} aria-hidden="true" />
      <div>
        <p className="eyebrow">Admin Shell</p>
        <h2 id="placeholder-title">{title}</h2>
        <p>공통 관리자 셸과 접근 제어가 적용된 화면입니다.</p>
      </div>
    </section>
  );
}

function PageLoading() {
  return (
    <main className="loading-screen" aria-live="polite">
      관리자 접근 권한을 확인하고 있습니다.
    </main>
  );
}

function AuthModal() {
  const { pendingAction, closeAuthModal, login } = usePublicAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    login(email);
  };

  return (
    <div className="public-modal-backdrop">
      <section
        aria-labelledby="auth-modal-title"
        aria-modal="true"
        className="public-auth-modal"
        role="dialog"
      >
        <div className="public-modal-header">
          <span className="public-modal-icon" aria-hidden="true">
            <ShieldCheck size={22} />
          </span>
          <div>
            <h2 id="auth-modal-title">로그인이 필요합니다</h2>
            <p>계속하면 요청한 작업으로 바로 돌아갑니다.</p>
          </div>
          <button
            aria-label="로그인 모달 닫기"
            className="public-icon-button"
            onClick={closeAuthModal}
            type="button"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="public-pending-action">
          <span>보호된 작업</span>
          <strong>{pendingAction?.label}</strong>
        </div>

        <form className="public-auth-form" onSubmit={handleSubmit}>
          <label>
            이메일
            <input
              autoComplete="email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="doctor@aiga.test"
              type="email"
              value={email}
            />
          </label>
          <label>
            비밀번호
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="비밀번호"
              type="password"
              value={password}
            />
          </label>
          <button className="public-primary-button" type="submit">
            <LogIn size={18} aria-hidden="true" />
            로그인
          </button>
        </form>
      </section>
    </div>
  );
}

function PublicLink({
  href,
  children,
  className,
  ariaLabel,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <a
      aria-label={ariaLabel}
      className={className}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}

function PublicShell({ route }: { route: PublicRoute }) {
  const { user, logout, requestAuth } = usePublicAuth();

  return (
    <div className="public-shell">
      <header className="public-topbar">
        <PublicLink ariaLabel="Aiga 홈" className="public-brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          <span>Aiga</span>
        </PublicLink>

        <nav className="public-nav" aria-label="주요 메뉴">
          <PublicLink href="/">홈</PublicLink>
          <PublicLink href="/browse">브라우즈</PublicLink>
          <PublicLink href="/community">커뮤니티</PublicLink>
          <PublicLink href="/mypage">마이페이지</PublicLink>
        </nav>

        <div className="public-header-actions">
          {user ? (
            <>
              <span className="public-user-badge">
                <UserRound size={16} aria-hidden="true" />
                {user.name}
              </span>
              <button className="public-ghost-button" onClick={logout} type="button">
                <LogOut size={17} aria-hidden="true" />
                로그아웃
              </button>
            </>
          ) : (
            <button
              aria-label="로그인 후 마이페이지"
              className="public-primary-button"
              onClick={() => requestAuth("로그인", () => navigate("/mypage"))}
              type="button"
            >
              <LogIn size={17} aria-hidden="true" />
              로그인
            </button>
          )}
        </div>
      </header>

      <main>
        {route.view === "home" ? <HomePage /> : null}
        {route.view === "browse" ? <BrowsePage /> : null}
        {route.view === "community" ? <CommunityPage /> : null}
        {route.view === "write" ? (
          <ProtectedPublicRoute actionLabel="게시글 작성" route={route}>
            <WritePage />
          </ProtectedPublicRoute>
        ) : null}
        {route.view === "mypage" ? (
          <ProtectedPublicRoute actionLabel="마이페이지 보기" route={route}>
            <MyPage />
          </ProtectedPublicRoute>
        ) : null}
        {route.view === "notFound" ? <NotFoundPage /> : null}
      </main>
    </div>
  );
}

function ProtectedPublicRoute({
  actionLabel,
  children,
  route,
}: {
  actionLabel: string;
  children: ReactNode;
  route: PublicRoute;
}) {
  const { user, requestAuth } = usePublicAuth();

  useEffect(() => {
    if (!user) {
      requestAuth(actionLabel, () => navigate(route.path));
    }
  }, [actionLabel, requestAuth, route.path, user]);

  if (!user) {
    return (
      <section className="public-route-guard">
        <ShieldCheck size={28} aria-hidden="true" />
        <h1>로그인이 필요한 화면</h1>
        <p>{actionLabel} 요청을 이어가려면 로그인하세요.</p>
      </section>
    );
  }

  return children;
}

function HomePage() {
  return (
    <>
      <section className="public-hero">
        <div className="public-hero-copy">
          <span className="public-eyebrow">
            <Sparkles size={16} aria-hidden="true" />
            의료진을 위한 공개 브라우즈
          </span>
          <h1>검증된 콘텐츠를 먼저 둘러보고, 필요한 순간에 로그인하세요.</h1>
          <p>
            Aiga는 비로그인 방문자도 콘텐츠와 커뮤니티 흐름을 확인할 수 있고,
            저장, 작성, 시작 같은 보호 액션에서만 인증을 요청합니다.
          </p>
        </div>
        <QuickActions />
      </section>

      <BrowseSection />
    </>
  );
}

function QuickActions() {
  const { requestAuth } = usePublicAuth();

  return (
    <div className="public-quick-actions" aria-label="빠른 작업">
      <button
        className="public-primary-button"
        onClick={() => requestAuth("상담 시작", () => navigate("/mypage"))}
        type="button"
      >
        <PlayCircle size={18} aria-hidden="true" />
        상담 시작
      </button>
      <button
        className="public-ghost-button"
        onClick={() => requestAuth("게시글 작성", () => navigate("/write"))}
        type="button"
      >
        <PencilLine size={18} aria-hidden="true" />
        글쓰기
      </button>
    </div>
  );
}

function BrowsePage() {
  return (
    <>
      <section className="public-page-header">
        <span className="public-eyebrow">
          <Search size={16} aria-hidden="true" />
          Public browse
        </span>
        <h1>브라우즈</h1>
        <p>로그인하지 않아도 콘텐츠 목록, 요약, 참여 정보를 확인할 수 있습니다.</p>
      </section>
      <BrowseSection />
    </>
  );
}

function BrowseSection() {
  return (
    <section className="public-content-band" aria-labelledby="browse-title">
      <div className="public-section-title">
        <div>
          <h2 id="browse-title">콘텐츠 둘러보기</h2>
          <p>저장과 시작은 보호 액션으로 인증 후 이어집니다.</p>
        </div>
        <label className="public-search-box">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">검색</span>
          <input placeholder="콘텐츠 검색" type="search" />
        </label>
      </div>

      <div className="public-content-grid">
        {contentItems.map((item) => (
          <ContentCard item={item} key={item.title} />
        ))}
      </div>
    </section>
  );
}

function ContentCard({ item }: { item: (typeof contentItems)[number] }) {
  const { requestAuth } = usePublicAuth();
  const [saved, setSaved] = useState(false);

  return (
    <article className="public-content-card">
      <div className="public-card-topline">
        <span>{item.category}</span>
        <BookOpen size={18} aria-hidden="true" />
      </div>
      <h3>{item.title}</h3>
      <p>{item.summary}</p>
      <span className="public-card-meta">{item.meta}</span>
      <div className="public-card-actions">
        <button
          aria-label={`${item.title} 저장`}
          className={saved ? "public-success-button" : "public-ghost-button"}
          onClick={() => requestAuth(`${item.title} 저장`, () => setSaved(true))}
          type="button"
        >
          <Bookmark size={17} aria-hidden="true" />
          {saved ? "저장됨" : "저장"}
        </button>
        {saved ? <span className="public-inline-status">{item.title} 저장 완료</span> : null}
      </div>
    </article>
  );
}

function CommunityPage() {
  const { requestAuth } = usePublicAuth();

  return (
    <>
      <section className="public-page-header">
        <span className="public-eyebrow">
          <MessageCircle size={16} aria-hidden="true" />
          Community
        </span>
        <h1>커뮤니티</h1>
        <p>글 목록은 공개로 탐색하고, 작성은 로그인 후 이어집니다.</p>
      </section>
      <section className="public-split-band">
        <div>
          <h2>최근 토론</h2>
          <ul className="public-discussion-list">
            <li>AI 판독 보조 결과를 설명하는 문장 톤</li>
            <li>병원 규모별 도입 체크리스트</li>
            <li>전문의 리뷰 요청 흐름 개선 아이디어</li>
          </ul>
        </div>
        <button
          className="public-primary-button"
          onClick={() => requestAuth("게시글 작성", () => navigate("/write"))}
          type="button"
        >
          <PencilLine size={18} aria-hidden="true" />
          글쓰기
        </button>
      </section>
    </>
  );
}

function WritePage() {
  return (
    <section className="public-page-header">
      <span className="public-eyebrow">
        <PencilLine size={16} aria-hidden="true" />
        Protected
      </span>
      <h1>게시글 작성</h1>
      <p>인증 후 원래 요청한 작성 화면으로 복귀했습니다.</p>
    </section>
  );
}

function MyPage() {
  return (
    <section className="public-mypage">
      <div className="public-page-header compact">
        <span className="public-eyebrow">
          <UserRound size={16} aria-hidden="true" />
          Protected
        </span>
        <h1>마이페이지</h1>
        <p>저장 콘텐츠, 예약, 인증 상태를 확인하는 개인 영역입니다.</p>
      </div>

      <div className="public-dashboard-grid">
        <article className="public-metric-card">
          <Bookmark size={20} aria-hidden="true" />
          <strong>12</strong>
          <span>저장 콘텐츠</span>
        </article>
        <article className="public-metric-card">
          <PlayCircle size={20} aria-hidden="true" />
          <strong>3</strong>
          <span>예정 일정</span>
        </article>
        <article className="public-metric-card">
          <ShieldCheck size={20} aria-hidden="true" />
          <strong>의료진</strong>
          <span>인증 등급</span>
        </article>
      </div>
    </section>
  );
}

function NotFoundPage() {
  return (
    <section className="public-route-guard">
      <h1>페이지를 찾을 수 없습니다</h1>
      <PublicLink className="public-primary-button" href="/">
        홈으로 이동
      </PublicLink>
    </section>
  );
}

export function AppShell() {
  const [route, setRoute] = useState(() => getPublicRoute(window.location.pathname));

  useEffect(() => {
    const handleRouteChange = () => setRoute(getPublicRoute(window.location.pathname));
    window.addEventListener("popstate", handleRouteChange);

    return () => window.removeEventListener("popstate", handleRouteChange);
  }, []);

  return (
    <PublicAuthProvider>
      <PublicShell route={route} />
    </PublicAuthProvider>
  );
}

export default function App() {
  const [isAdminRoute, setIsAdminRoute] = useState(() =>
    window.location.pathname.startsWith("/admin"),
  );

  useEffect(() => {
    const handleRouteChange = () => setIsAdminRoute(window.location.pathname.startsWith("/admin"));
    window.addEventListener("popstate", handleRouteChange);

    return () => window.removeEventListener("popstate", handleRouteChange);
  }, []);

  return isAdminRoute ? <AdminApp /> : <AppShell />;
}
