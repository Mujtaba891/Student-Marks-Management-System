const fs = require('fs');
let content = fs.readFileSync('src/ui/appRenderer.ts', 'utf-8');

const target = `  private renderStudentsView(
    students: Student[],
    subjects: Subject[],
    results: Result[]
  ): string {
    let filteredStudents = [...students];

    // Filter by search query
    if (this.currentSearchQuery.trim()) {
      const q = this.currentSearchQuery.toLowerCase().trim();
      filteredStudents = filteredStudents.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.rollNumber.toLowerCase().includes(q) ||
        s.studentId.toLowerCase().includes(q)
      );
    }

    // Filter by subject
    if (this.subjectFilter) {
      const enrolledStudentIds = new Set(
        results.filter(r => r.subjectId === this.subjectFilter).map(r => r.studentId)
      );
      filteredStudents = filteredStudents.filter(s => enrolledStudentIds.has(s.id));
    }

    // Sort
    filteredStudents.sort((a, b) => {
      let valA: any = a.name;
      let valB: any = b.name;

      if (this.studentSortField === 'rollNumber') {
        valA = parseFloat(a.normalizedRollNumber) || a.rollNumber;
        valB = parseFloat(b.normalizedRollNumber) || b.rollNumber;
      } else if (this.studentSortField === 'studentId') {
        valA = a.studentId;
        valB = b.studentId;
      } else if (this.studentSortField === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      }

      if (valA < valB) return this.studentSortAsc ? -1 : 1;
      if (valA > valB) return this.studentSortAsc ? 1 : -1;
      return 0;
    });

    // Pagination
    const totalCount = filteredStudents.length;
    const totalPages = Math.ceil(totalCount / this.studentPageSize) || 1;
    const currentPage = Math.min(this.studentPage, totalPages);
    const startIndex = (currentPage - 1) * this.studentPageSize;
    const pagedStudents = filteredStudents.slice(startIndex, startIndex + this.studentPageSize);

    // Check if all on current page are selected
    const allSelected = pagedStudents.length > 0 && pagedStudents.every(s => this.selectedStudentIds.has(s.id));

    // Build Results Map for fast lookup
    const resultMap = new Map<string, Result[]>();
    for (const r of results) {
      if (!resultMap.has(r.studentId)) resultMap.set(r.studentId, []);
      resultMap.get(r.studentId)!.push(r);
    }
    
    // Extract unique dynamic fields from all students
    const dynamicFieldsSet = new Set<string>();
    filteredStudents.forEach(s => {
      if (s.dynamicFields) {
        Object.keys(s.dynamicFields).forEach(k => dynamicFieldsSet.add(k));
      }
    });
    const dynamicColumns = Array.from(dynamicFieldsSet);

    const tableRows = pagedStudents.map((s, idx) => {
      const sResults = resultMap.get(s.id) || [];
      const isSelected = this.selectedStudentIds.has(s.id);
      
      let totalMarks = 0;
      let totalMax = 0;
      let numCount = 0;
      for (const r of sResults) {
        if (typeof r.marks === 'number') {
          totalMarks += r.marks;
          totalMax += r.maxMarks;
          numCount++;
        }
      }

      const avgPct = totalMax > 0 ? Math.round((totalMarks / totalMax) * 1000) / 10 : 0;
      
      let grade = '-';
      if (numCount > 0) {
        if (avgPct >= 90) grade = 'A+';
        else if (avgPct >= 80) grade = 'A';
        else if (avgPct >= 70) grade = 'B+';
        else if (avgPct >= 60) grade = 'B';
        else if (avgPct >= 50) grade = 'C';
        else if (avgPct >= (this.settings.passPercentage || 40)) grade = 'D';
        else grade = 'F';
      }`;

const replacement = `  private renderStudentsView(
    students: Student[],
    subjects: Subject[],
    results: Result[]
  ): string {
    // Build Results Map for fast lookup
    const resultMap = new Map<string, Result[]>();
    for (const r of results) {
      if (!resultMap.has(r.studentId)) resultMap.set(r.studentId, []);
      resultMap.get(r.studentId)!.push(r);
    }

    let enrichedStudents = students.map(s => {
      const sResults = resultMap.get(s.id) || [];
      let totalMarks = 0;
      let totalMax = 0;
      let numCount = 0;
      for (const r of sResults) {
        if (typeof r.marks === 'number') {
          totalMarks += r.marks;
          totalMax += r.maxMarks;
          numCount++;
        }
      }
      const avgPct = totalMax > 0 ? Math.round((totalMarks / totalMax) * 1000) / 10 : 0;
      let grade = '-';
      if (numCount > 0) {
        if (avgPct >= 90) grade = 'A+';
        else if (avgPct >= 80) grade = 'A';
        else if (avgPct >= 70) grade = 'B+';
        else if (avgPct >= 60) grade = 'B';
        else if (avgPct >= 50) grade = 'C';
        else if (avgPct >= (this.settings.passPercentage || 40)) grade = 'D';
        else grade = 'F';
      }
      return { ...s, avgPct, grade, totalMarks, totalMax };
    });

    let filteredStudents = [...enrichedStudents];

    // Filter by global search query
    if (this.currentSearchQuery.trim()) {
      const q = this.currentSearchQuery.toLowerCase().trim();
      filteredStudents = filteredStudents.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.rollNumber.toLowerCase().includes(q) ||
        s.studentId.toLowerCase().includes(q) ||
        s.grade.toLowerCase().includes(q) ||
        s.avgPct.toString().includes(q)
      );
    }
    
    // Filter by local search query
    if (this.studentLocalSearch && this.studentLocalSearch.trim()) {
      const q = this.studentLocalSearch.toLowerCase().trim();
      filteredStudents = filteredStudents.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.rollNumber.toLowerCase().includes(q) ||
        s.studentId.toLowerCase().includes(q) ||
        s.grade.toLowerCase().includes(q) ||
        s.avgPct.toString().includes(q)
      );
    }

    // Filter by subject
    if (this.subjectFilter) {
      const enrolledStudentIds = new Set(
        results.filter(r => r.subjectId === this.subjectFilter).map(r => r.studentId)
      );
      filteredStudents = filteredStudents.filter(s => enrolledStudentIds.has(s.id));
    }

    // Sort
    filteredStudents.sort((a, b) => {
      let valA: any = a.name;
      let valB: any = b.name;

      if (this.studentSortField === 'rollNumber') {
        valA = parseFloat(a.normalizedRollNumber) || a.rollNumber;
        valB = parseFloat(b.normalizedRollNumber) || b.rollNumber;
      } else if (this.studentSortField === 'studentId') {
        valA = a.studentId;
        valB = b.studentId;
      } else if (this.studentSortField === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (this.studentSortField === 'percentage') {
        valA = a.avgPct;
        valB = b.avgPct;
      } else if (this.studentSortField === 'grade') {
        valA = a.grade;
        valB = b.grade;
      }

      if (valA < valB) return this.studentSortAsc ? -1 : 1;
      if (valA > valB) return this.studentSortAsc ? 1 : -1;
      return 0;
    });

    // Pagination
    const totalCount = filteredStudents.length;
    const totalPages = Math.ceil(totalCount / this.studentPageSize) || 1;
    const currentPage = Math.min(this.studentPage, totalPages);
    const startIndex = (currentPage - 1) * this.studentPageSize;
    const pagedStudents = filteredStudents.slice(startIndex, startIndex + this.studentPageSize);

    // Check if all on current page are selected
    const allSelected = pagedStudents.length > 0 && pagedStudents.every(s => this.selectedStudentIds.has(s.id));
    
    // Extract unique dynamic fields from all students
    const dynamicFieldsSet = new Set<string>();
    filteredStudents.forEach(s => {
      if (s.dynamicFields) {
        Object.keys(s.dynamicFields).forEach(k => dynamicFieldsSet.add(k));
      }
    });
    const dynamicColumns = Array.from(dynamicFieldsSet);

    const tableRows = pagedStudents.map((s, idx) => {
      const isSelected = this.selectedStudentIds.has(s.id);
      
      const avgPct = s.avgPct;
      const grade = s.grade;
      const totalMarks = s.totalMarks;
      const totalMax = s.totalMax;
      const numCount = (resultMap.get(s.id) || []).filter(r => typeof r.marks === 'number').length;`;

content = content.replace(target, replacement);
fs.writeFileSync('src/ui/appRenderer.ts', content);
