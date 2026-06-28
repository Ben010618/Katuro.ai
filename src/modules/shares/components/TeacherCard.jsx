import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { FollowButton } from './FollowButton';
import { avatarColor } from '../services/sharesService';

export function TeacherCard({ teacher, myUid, myName }) {
  const bg = avatarColor(teacher.id);
  return (
    <div className="sh-teacher-card">
      <Link to={`/shares/profile/${teacher.id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <div
          className="sh-avatar sh-avatar--sm"
          style={{ background: bg, color: '#fff', fontSize: 12 }}
        >
          {teacher.initials || 'T'}
        </div>
        <div className="sh-teacher-card-info">
          <div className="sh-teacher-card-name">{teacher.displayName}</div>
          <div className="sh-teacher-card-school">{teacher.school || teacher.gradeLevel || 'Teacher'}</div>
        </div>
      </Link>
      <FollowButton myUid={myUid} targetUid={teacher.id} myName={myName} />
    </div>
  );
}

TeacherCard.propTypes = {
  teacher: PropTypes.shape({
    id:          PropTypes.string.isRequired,
    displayName: PropTypes.string,
    initials:    PropTypes.string,
    school:      PropTypes.string,
    gradeLevel:  PropTypes.string,
  }).isRequired,
  myUid:  PropTypes.string.isRequired,
  myName: PropTypes.string,
};
