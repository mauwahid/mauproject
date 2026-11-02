import React from 'react';
import { TopBar, NewButton } from '../components/layout.jsx';
import TaskList from '../components/TaskList.jsx';

export default function Tasks({ openModal }) {
  return (
    <>
      <TopBar title="Tasks" crumbs="All open projects">
        <NewButton label="New Task" onClick={() => openModal({ type: 'task' })} />
      </TopBar>
      <div className="content">
        <TaskList showProject />
      </div>
    </>
  );
}
