import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import ClassroomPageComponent from '../components/pages/ClassroomPage';

export default function ClassroomPage() {
  const { user } = useAuth();
  const [selectedClass, setSelectedClass] = useState(null);

  if (!user) return null;

  return (
    <ClassroomPageComponent
      user={user}
      selectedClass={selectedClass}
      onOpenClass={setSelectedClass}
    />
  );
}
