import { Link, useParams } from 'react-router-dom';
import { publicApi } from '../api/public.js';
import { useAsync } from '../hooks/useAsync.js';
import { useProtectedAction, libraryPathFor } from '../features/subjects/SubjectGrid.jsx';
import { ErrorState, LoadingSkeleton } from '../components/StateViews.jsx';
import Seo from '../components/Seo.jsx';

export default function SubjectDetailPage() {
  const { subjectId } = useParams();
  const { loading, error, data, reload } = useAsync((s) => publicApi.subject(subjectId, s), [subjectId]);
  const { open, modal } = useProtectedAction();
  return (
    <section className="section">
      <Seo title={data ? `${data.name} study materials` : 'Subject study materials'} description={data?.description || (data ? `Browse ${data.materialCount} published study ${data.materialCount === 1 ? 'resource' : 'resources'} for ${data.name} on CampusPages.` : undefined)} noIndex={!data || !!error} />
      <div className="container">
        <p><Link to="/subjects">← All subjects</Link></p>
        {loading && <LoadingSkeleton rows={2} />}
        {error?.status === 404 && <><h1>Subject not found</h1><p className="muted">This subject doesn’t exist or has no published materials yet.</p></>}
        {error && error.status !== 404 && <ErrorState message="This subject could not be loaded." onRetry={reload} />}
        {data && (
          <>
            <h1>{data.name}</h1>
            {data.description && <p className="muted">{data.description}</p>}
            <p>{data.materialCount} {data.materialCount === 1 ? 'study material' : 'study materials'} available to signed-in students.</p>
            <button type="button" className="btn btn-primary" onClick={() => open(libraryPathFor(data.id))}>View Notes</button>
            {modal}
          </>
        )}
      </div>
    </section>
  );
}
