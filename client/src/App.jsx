import { Route, Routes } from 'react-router-dom';
import PublicLayout from './layouts/PublicLayout.jsx';
import HomePage from './pages/HomePage.jsx';
import SubjectsPage from './pages/SubjectsPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import UnauthorizedPage from './pages/UnauthorizedPage.jsx';
import SubjectDetailPage from './pages/SubjectDetailPage.jsx';
import StudentLayout from './features/student/StudentLayout.jsx';
import StudentDashboard from './features/student/StudentDashboard.jsx';
import NotesLibrary from './features/student/NotesLibrary.jsx';
import ViewerPage from './features/viewer/ViewerPage.jsx';
import AdminLayout from './features/admin/AdminLayout.jsx';
import AdminDashboard from './features/admin/pages/AdminDashboard.jsx';
import AdminUpload from './features/admin/pages/AdminUpload.jsx';
import AdminDocuments from './features/admin/pages/AdminDocuments.jsx';
import { ProtectedRoute, RoleGuard } from './routes/guards.jsx';

// Public routes are deliberately NOT wrapped in any auth guard. Guards are UX only; the API enforces access.
export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="subjects" element={<SubjectsPage />} />
        <Route path="subjects/:subjectId" element={<SubjectDetailPage />} />
      </Route>
      <Route path="login" element={<LoginPage />} />
      <Route path="register" element={<RegisterPage />} />
      <Route path="signup" element={<RegisterPage />} />
      <Route path="unauthorized" element={<UnauthorizedPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="app" element={<StudentLayout />}>
          <Route index element={<StudentDashboard />} />
          <Route path="notes" element={<NotesLibrary />} />
        </Route>
        <Route path="app/documents/:id" element={<ViewerPage />} />
        <Route element={<RoleGuard role="admin" />}>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="upload" element={<AdminUpload />} />
            <Route path="documents" element={<AdminDocuments />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
