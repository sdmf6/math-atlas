import { scanAllQuestionsMeta } from '@/lib/questions';
import FilterableTable from '@/components/FilterableTable';
import ThemeToggle from '@/components/ThemeToggle';

export default function Home() {
  const questions = scanAllQuestionsMeta();

  return (
    <main style={{ padding: '2rem' }}>
      <ThemeToggle />
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>MathAtlas</h1>
        <a href="/add" style={{ fontSize: '0.88rem', color: 'var(--accent)', textDecoration: 'none' }}>+ 添加题目</a>
      </div>
      <p>共 {questions.length} 道题目</p>
      <FilterableTable questions={questions} />
    </main>
  );
}
