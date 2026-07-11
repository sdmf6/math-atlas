'use client';
import { useEffect, useState } from 'react';
import FilterableTable from '@/components/FilterableTable';
import ThemeToggle from '@/components/ThemeToggle';

export default function Home() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/questions/meta', { cache: 'no-store' });
      const data = await res.json();
      setQuestions(data);
    } catch {
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <main style={{ padding: '2rem' }}>
      <ThemeToggle />
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>MathAtlas</h1>
        <a href="/add" style={{ fontSize: '0.88rem', color: 'var(--accent)', textDecoration: 'none' }}>+ 添加题目</a>
      </div>
      <p>共 {questions.length} 道题目</p>
      {loading ? <p>加载中...</p> : <FilterableTable questions={questions} />}
    </main>
  );
}
