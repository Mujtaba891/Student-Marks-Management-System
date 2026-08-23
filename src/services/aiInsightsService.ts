import { Student, Result } from '../types';

export async function fetchAiInsights(students: Student[], results: Result[]) {
  // Aggregate basic class data to send to AI
  const classData = {
    totalStudents: students.length,
    totalResults: results.length,
    students: students.map(s => {
      // Find results for this student
      const stResults = results.filter(r => r.studentId === s.id);
      let totalMarks = 0;
      let totalMaxMarks = 0;
      stResults.forEach(r => {
        if (typeof r.marks === 'number') {
          totalMarks += r.marks;
          totalMaxMarks += (r.maxMarks || 100);
        }
      });
      const pct = totalMaxMarks > 0 ? ((totalMarks / totalMaxMarks) * 100).toFixed(2) : 0;
      return {
        id: s.id,
        name: s.name,
        percentage: Number(pct),
        subjectsEvaluated: stResults.length
      };
    })
  };

  const response = await fetch('/api/gemini/insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ classData })
  });

  if (!response.ok) {
    let errorMsg = `Server error (${response.status})`;
    try {
      const errorData = await response.json();
      errorMsg = errorData.error || errorMsg;
    } catch {
      if (response.status === 500) {
        errorMsg = 'Server Error (500): Please ensure GEMINI_API_KEY environment variable is configured in Vercel settings and redeploy.';
      } else {
        errorMsg = `Server error ${response.status}. Please check backend logs.`;
      }
    }
    throw new Error(errorMsg);
  }

  return await response.json();
}
