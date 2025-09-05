import React, { useEffect, useState } from 'react';
import './ResumeInterviewSetupSlidePanel.css';
import appConfig from '../config.ts';

interface Interviewer {
  name: string;
  email: string;
}

interface TodoItem {
  id: string;
  label: string;
}

interface Props {
  candidateId: string;
  stage: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    interviewDate: string;
    interviewer: string;
    todo: string;
    candidateMail: string;
    interviewerMail: string;
    stage: string;
  }) => void;
}

const ResumeInterviewSetupSlidePanel: React.FC<Props> = ({ candidateId, stage, isOpen, onClose, onSubmit }) => {
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewerList, setInterviewerList] = useState<Interviewer[]>([]);
  const [selectedInterviewer, setSelectedInterviewer] = useState('');
  const [todoList, setTodoList] = useState<TodoItem[]>([]);
  const [selectedTodos, setSelectedTodos] = useState<string[]>([]);
  const [candidateMail, setCandidateMail] = useState('');
  const [interviewerMail, setInterviewerMail] = useState('');

  useEffect(() => {
    fetch(`${appConfig.API_BASE_URL}/interview/config`)
      .then(res => res.json())
      .then(data => {
        setInterviewerList(data.interviewers || []);
        setTodoList(data.todos || []);
        setCandidateMail(data.email_templates.to_candidate.body || '');
        setInterviewerMail(data.email_templates.to_interviewer.body || '');
      });
  }, []);

  const renderTemplate = (template: string): string => {
    const mapping: Record<string, string> = {
      candidate_name: candidateId,
      interview_date: interviewDate || '',
      interviewer_name: selectedInterviewer || '',
    };

    return template.replace(/{{\s*(\w+)\s*}}/g, (_, key) => mapping[key] || '');
  };

    const handleSubmit = () => {
      if (!interviewDate || !selectedInterviewer) {
        alert('日程と担当者は必須です');
        return;
      }

      onSubmit({
        interviewDate,
        interviewer: selectedInterviewer,
        todo: selectedTodos.join(', '),
        candidateMail: renderTemplate(candidateMail),     // ← 展開済みに
        interviewerMail: renderTemplate(interviewerMail),  // ← 展開済みに
        stage 
      });

      onClose();
    };

  return (
    <>
      <div className="slide-overlay" onClick={onClose}></div>
      <div className={`slide-panel ${isOpen ? 'open' : ''}`}>
        <div className="slide-panel-header">
          <h3>{stage} の面談設定: {candidateId}</h3>
          <button className="slide-close" onClick={onClose}>✖</button>
        </div>

        <div className="interview-setup-field">
          <label>面談日時:</label>
          <input type="datetime-local" value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)} />
        </div>

        <div className="interview-setup-field">
          <label>面談担当者:</label>
          <select value={selectedInterviewer} onChange={(e) => setSelectedInterviewer(e.target.value)}>
            <option value="">選択してください</option>
            {interviewerList.map(i => (
              <option key={`${i.email}_${i.name}`} value={i.name}>{i.name}（{i.email}）</option>
            ))}
          </select>
        </div>

        <div className="interview-setup-field">
          <label>面談前TODO:</label>
          <div className="setup-todo-list">
            {todoList.map(item => (
              <div key={item.id} className="setup-todo-item">
                <input
                  type="checkbox"
                  checked={selectedTodos.includes(item.label)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedTodos([...selectedTodos, item.label]);
                    } else {
                      setSelectedTodos(selectedTodos.filter(t => t !== item.label));
                    }
                  }}
                />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="interview-setup-field">
          <label>候補者宛メールテンプレート:</label>
          <textarea rows={4} value={candidateMail} onChange={(e) => setCandidateMail(e.target.value)} />
          <p style={{ fontWeight: 'bold', marginTop: '8px' }}>📧 プレビュー:</p>
          <div className="resume-template-preview">{renderTemplate(candidateMail)}</div>
        </div>

        <div className="interview-setup-field">
          <label>担当者宛メールテンプレート:</label>
          <textarea rows={4} value={interviewerMail} onChange={(e) => setInterviewerMail(e.target.value)} />
          <p style={{ fontWeight: 'bold', marginTop: '8px' }}>📧 プレビュー:</p>
          <div className="resume-template-preview">{renderTemplate(interviewerMail)}</div>
        </div>

        <div className="interview-setup-actions">
          <button onClick={handleSubmit}>送信</button>
          <button onClick={onClose}>キャンセル</button>
        </div>
      </div>
    </>
  );
};

export default ResumeInterviewSetupSlidePanel;