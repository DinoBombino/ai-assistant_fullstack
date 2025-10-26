// client/src/utils/markdown.ts
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Настройка marked (с приведением к any)
marked.setOptions({
  gfm: true,
  breaks: false,
  headerIds: true,
} as any);

// Функция для безопасного парсинга Markdown → HTML
export const parseMarkdown = (text: string): string => {
  if (!text) return '';
  
  try {
    // Используем marked.parseSync если доступен, иначе обычный parse
    const html = (marked.parse as any)(text);
    return DOMPurify.sanitize(html);
  } catch (error) {
    console.error('Error parsing markdown:', error);
    return DOMPurify.sanitize(text);
  }
};
