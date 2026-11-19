import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { loadSubmissionPhoto } from "./submissions";

function usePhotoUrl(photo?: Blob) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = photo ? URL.createObjectURL(photo) : "";
    setUrl(next);
    return () => { if (next) URL.revokeObjectURL(next); };
  }, [photo]);
  return url;
}

export function DraftPreview({ photo }: { photo: File }) {
  return <img src={usePhotoUrl(photo) || undefined} alt={photo.name} />;
}

export function SubmissionPhoto({ id }: { id: string }) {
  const [photo, setPhoto] = useState<Blob>();
  useEffect(() => {
    let active = true;
    loadSubmissionPhoto(id).then((value) => { if (active) setPhoto(value); }).catch(() => {});
    return () => { active = false; };
  }, [id]);
  const url = usePhotoUrl(photo);
  return url ? <img src={url} alt="待审核实拍" /> : <div className="submission-placeholder"><Send size={16} /></div>;
}
