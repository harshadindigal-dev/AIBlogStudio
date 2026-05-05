import { BlogStudio } from './components/blog/BlogStudio';

function App() {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-ink-950 relative">
      {/* Animated background orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0" aria-hidden>
        <div
          className="absolute -top-72 -left-72 w-[700px] h-[700px] rounded-full blur-[140px] opacity-60"
          style={{
            background: 'radial-gradient(circle, rgba(0,229,255,0.07) 0%, transparent 70%)',
            animation: 'orb1 14s ease-in-out infinite',
          }}
        />
        <div
          className="absolute -bottom-72 -right-72 w-[700px] h-[700px] rounded-full blur-[140px] opacity-60"
          style={{
            background: 'radial-gradient(circle, rgba(168,85,247,0.07) 0%, transparent 70%)',
            animation: 'orb2 18s ease-in-out infinite',
          }}
        />
        <div
          className="absolute top-1/3 right-1/4 w-[400px] h-[400px] rounded-full blur-[100px] opacity-30"
          style={{ background: 'radial-gradient(circle, rgba(0,229,255,0.04) 0%, transparent 70%)' }}
        />
      </div>

      {/* App content */}
      <div className="flex flex-col h-full relative z-10">
        <BlogStudio />
      </div>
    </div>
  );
}

export default App;
