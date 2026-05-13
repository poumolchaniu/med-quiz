import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

type Screen = 'start' | 'quiz' | 'result' | 'admin-login' | 'admin-results';
type SortColumn = 'createdAt' | 'department' | 'position';
type SortDirection = 'asc' | 'desc';

interface Answer {
  label: string;
  text: string;
  correct: boolean;
}

interface Question {
  text: string;
  answers: Answer[];
}

interface Student {
  fullName: string;
  position: string;
  department: string;
}

interface TestResult {
  id: number;
  fullName: string;
  position: string;
  department: string;
  score: number;
  totalQuestions: number;
  percent: number;
  createdAt: string;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  screen: Screen = 'start';
  student: Student = {
    fullName: '',
    position: '',
    department: ''
  };

  questions: Question[] = [];
  selections: number[][] = [];
  currentIndex = 0;
  loading = true;
  loadError = '';
  savingResult = false;
  resultSaved = false;
  saveError = '';
  adminPassword = '';
  adminError = '';
  adminLoading = false;
  adminAuth = '';
  results: TestResult[] = [];
  surnameFilter = '';
  sortColumn: SortColumn = 'createdAt';
  sortDirection: SortDirection = 'desc';

  async ngOnInit(): Promise<void> {
    try {
      const response = await fetch('tests.txt');

      if (!response.ok) {
        throw new Error(`Не удалось загрузить tests.txt (${response.status})`);
      }

      const source = await response.text();
      this.questions = this.parseQuestions(source);
      this.selections = this.questions.map(() => []);
    } catch (error) {
      this.loadError = error instanceof Error ? error.message : 'Не удалось загрузить тест';
    } finally {
      this.loading = false;
    }
  }

  get currentQuestion(): Question | undefined {
    return this.questions[this.currentIndex];
  }

  get fullName(): string {
    return this.student.fullName.trim();
  }

  get canStart(): boolean {
    return Boolean(
      this.student.fullName.trim()
      && this.student.position.trim()
      && this.student.department.trim()
      && this.questions.length
    );
  }

  get canGoNext(): boolean {
    return (this.selections[this.currentIndex]?.length ?? 0) > 0;
  }

  get isLastQuestion(): boolean {
    return this.currentIndex === this.questions.length - 1;
  }

  get score(): number {
    return this.questions.reduce((total, question, index) => (
      this.isCorrect(question, this.selections[index]) ? total + 1 : total
    ), 0);
  }

  get percent(): number {
    return this.questions.length ? Math.round((this.score / this.questions.length) * 100) : 0;
  }

  get progress(): number {
    return this.questions.length ? Math.round(((this.currentIndex + 1) / this.questions.length) * 100) : 0;
  }

  startQuiz(): void {
    if (!this.canStart) {
      return;
    }

    this.screen = 'quiz';
    this.currentIndex = 0;
  }

  selectSingle(answerIndex: number): void {
    this.selections[this.currentIndex] = [answerIndex];
  }

  toggleMultiple(answerIndex: number): void {
    const selected = new Set(this.selections[this.currentIndex]);

    if (selected.has(answerIndex)) {
      selected.delete(answerIndex);
    } else {
      selected.add(answerIndex);
    }

    this.selections[this.currentIndex] = [...selected].sort((a, b) => a - b);
  }

  isSelected(answerIndex: number): boolean {
    return this.selections[this.currentIndex]?.includes(answerIndex) ?? false;
  }

  hasMultipleCorrect(question: Question): boolean {
    return question.answers.filter((answer) => answer.correct).length > 1;
  }

  async nextQuestion(): Promise<void> {
    if (!this.canGoNext) {
      return;
    }

    if (this.isLastQuestion) {
      this.screen = 'result';
      await this.saveResult();
      return;
    }

    this.currentIndex += 1;
  }

  previousQuestion(): void {
    this.currentIndex = Math.max(0, this.currentIndex - 1);
  }

  restart(): void {
    this.selections = this.questions.map(() => []);
    this.currentIndex = 0;
    this.resultSaved = false;
    this.saveError = '';
    this.screen = 'start';
  }

  openAdminLogin(): void {
    this.adminPassword = '';
    this.adminError = '';
    this.screen = 'admin-login';
  }

  async submitAdminPassword(): Promise<void> {
    this.adminError = '';
    this.adminLoading = true;

    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: this.adminPassword })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        this.adminError = body.error || 'Неверный пароль';
        return;
      }

      this.adminAuth = this.adminPassword;
      await this.loadResults();
    } catch (error) {
      this.adminError = error instanceof Error ? error.message : 'Не удалось войти';
    } finally {
      this.adminLoading = false;
    }
  }

  async loadResults(): Promise<void> {
    this.adminLoading = true;
    this.adminError = '';

    try {
      const response = await fetch('/api/results', {
        headers: { 'X-Admin-Password': this.adminAuth }
      });

      if (response.status === 401) {
        this.adminAuth = '';
        this.adminError = 'Сессия истекла, войдите заново';
        this.screen = 'admin-login';
        return;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Не удалось загрузить результаты');
      }

      this.results = await response.json();
      this.screen = 'admin-results';
    } catch (error) {
      this.adminError = error instanceof Error ? error.message : 'Не удалось загрузить результаты';
    } finally {
      this.adminLoading = false;
    }
  }

  backToStart(): void {
    this.adminPassword = '';
    this.adminAuth = '';
    this.adminError = '';
    this.screen = 'start';
  }

  get filteredResults(): TestResult[] {
    const query = this.surnameFilter.trim().toLowerCase();
    const filtered = query
      ? this.results.filter((result) => (result.fullName || '').toLowerCase().includes(query))
      : this.results.slice();

    const direction = this.sortDirection === 'asc' ? 1 : -1;
    const column = this.sortColumn;

    return filtered.sort((a, b) => {
      const valueA = (a[column] ?? '').toString().toLowerCase();
      const valueB = (b[column] ?? '').toString().toLowerCase();

      if (valueA < valueB) {
        return -1 * direction;
      }
      if (valueA > valueB) {
        return 1 * direction;
      }
      return 0;
    });
  }

  setSort(column: SortColumn): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = column === 'createdAt' ? 'desc' : 'asc';
    }
  }

  sortIndicator(column: SortColumn): string {
    if (this.sortColumn !== column) {
      return '';
    }
    return this.sortDirection === 'asc' ? ' ▲' : ' ▼';
  }

  formatDate(value: string): string {
    if (!value) {
      return '';
    }

    return new Date(value.replace(' ', 'T')).toLocaleString('ru-RU');
  }

  private async saveResult(): Promise<void> {
    if (this.savingResult || this.resultSaved) {
      return;
    }

    this.savingResult = true;
    this.saveError = '';

    try {
      const response = await fetch('/api/results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fullName: this.student.fullName.trim(),
          position: this.student.position.trim(),
          department: this.student.department.trim(),
          score: this.score,
          totalQuestions: this.questions.length,
          percent: this.percent
        })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Не удалось сохранить результат');
      }

      this.resultSaved = true;
    } catch (error) {
      this.saveError = error instanceof Error ? error.message : 'Не удалось сохранить результат';
    } finally {
      this.savingResult = false;
    }
  }

  private parseQuestions(source: string): Question[] {
    return source
      .replace(/\r\n/g, '\n')
      .split(/\n{2,}/)
      .map((block) => block.split('\n').map((line) => line.trim()).filter(Boolean))
      .map((lines) => this.parseQuestionBlock(lines))
      .filter((question): question is Question => Boolean(question));
  }

  private parseQuestionBlock(lines: string[]): Question | null {
    const firstAnswerIndex = lines.findIndex((line) => this.isAnswerLine(line));

    if (firstAnswerIndex <= 0) {
      return null;
    }

    const text = lines.slice(0, firstAnswerIndex).join(' ');
    const answers = lines.slice(firstAnswerIndex)
      .map((line) => this.parseAnswer(line))
      .filter((answer): answer is Answer => Boolean(answer));

    return answers.length ? { text, answers } : null;
  }

  private parseAnswer(line: string): Answer | null {
    const match = line.match(/^([0-9]+|[А-ЯЁA-Z])[\).]\s*(.+)$/i);

    if (!match) {
      return null;
    }

    const rawText = match[2].trim();
    const correct = rawText.endsWith('*');

    return {
      label: match[1],
      text: correct ? rawText.slice(0, -1).trim() : rawText,
      correct
    };
  }

  private isAnswerLine(line: string): boolean {
    return /^([0-9]+|[А-ЯЁA-Z])[\).]\s+/i.test(line);
  }

  private isCorrect(question: Question, selected: number[]): boolean {
    const selectedSet = new Set(selected);
    const correctIndexes = question.answers
      .map((answer, index) => answer.correct ? index : -1)
      .filter((index) => index >= 0);

    return correctIndexes.length === selectedSet.size
      && correctIndexes.every((index) => selectedSet.has(index));
  }
}
