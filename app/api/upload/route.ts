// Server endpoint that receives the uploaded file at POST /api/upload.
// We check the file type again here, because browser checks can be bypassed.
// (Saving the file to storage comes in a later step.)

import { checkFileSize, limitMessage, PLANS } from "@/lib/plans";
import { getUserPlanId } from "@/lib/user-plan";

const ALLOWED_EXTENSIONS = [".csv", ".xlsx"];

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "No file was received." }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return Response.json(
      { error: `"${file.name}" isn't supported. Please upload a .csv or .xlsx file.` },
      { status: 400 }
    );
  }

  const planId = await getUserPlanId();
  const sizeProblem = checkFileSize(file.size, PLANS[planId]);
  if (sizeProblem) {
    return Response.json({ error: limitMessage(sizeProblem) }, { status: 400 });
  }

  return Response.json({ name: file.name, size: file.size, planId });
}
