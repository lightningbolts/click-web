import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApplicationForm } from "@/components/careers/ApplicationForm";
import { findRole } from "@/components/careers/roles";

const role = findRole("marketing-intern")!;
const fetchMock = jest.fn();

/** jsdom has no `Response`; the form reads only these. */
function reply(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Full name"), "Dubs Husky");
  await user.type(screen.getByLabelText("UW email"), "dubs@uw.edu");
  await user.selectOptions(screen.getByLabelText("Year in school"), "junior");
  await user.type(screen.getByLabelText("Major(s) or intended major"), "Informatics");
  await user.selectOptions(screen.getByLabelText("Quarter"), "spring");
  await user.selectOptions(screen.getByLabelText("Year"), String(new Date().getFullYear() + 2));
  await user.click(screen.getByLabelText("5–10 hours"));
  fireEvent.change(screen.getByLabelText("Earliest start date"), {
    target: { value: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10) },
  });
  await user.click(screen.getByLabelText("Campus outreach & tabling"));
  await user.type(screen.getByLabelText(role.pitchPrompt), "Energy, reach, and a lot of tabling.");
  await user.upload(
    screen.getByLabelText("Resume or CV"),
    new File(["%PDF-1.7"], "resume.pdf", { type: "application/pdf" }),
  );
  await user.click(screen.getByLabelText("Yes, I'm on the iOS beta"));
  await user.click(screen.getByLabelText("Friend or classmate"));
}

describe("ApplicationForm", () => {
  it("shows specific errors and focuses the first one instead of submitting", async () => {
    const user = userEvent.setup();
    render(<ApplicationForm role={role} />);

    await user.click(screen.getByRole("button", { name: "Submit application" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Full name")).toHaveFocus();
    expect(screen.getByLabelText("Full name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter your UW email address.")).toBeInTheDocument();
    expect(screen.getByText("Attach your resume.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/Check the \d+ highlighted answers/);

    await user.type(screen.getByLabelText("Full name"), "D");
    expect(screen.getByLabelText("Full name")).not.toHaveAttribute("aria-invalid");
  });

  it("counts pitch words live and flags going over the limit", async () => {
    render(<ApplicationForm role={role} />);
    const pitch = screen.getByLabelText(role.pitchPrompt);

    fireEvent.change(pitch, { target: { value: "one two  three" } });
    expect(screen.getByText("3/200 words")).toBeInTheDocument();

    fireEvent.change(pitch, { target: { value: Array.from({ length: 205 }, () => "w").join(" ") } });
    expect(screen.getByText("That's 5 words over the limit.")).toBeInTheDocument();
  });

  it("rejects unsupported files and lets you remove a chosen one", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<ApplicationForm role={role} />);
    const input = screen.getByLabelText("Resume or CV");

    await user.upload(input, new File(["x"], "photo.png", { type: "image/png" }));
    expect(screen.getByText(/Upload a PDF or Word document/)).toBeInTheDocument();

    await user.upload(input, new File(["%PDF"], "resume.pdf", { type: "application/pdf" }));
    expect(screen.getByText("resume.pdf")).toBeInTheDocument();
    expect(screen.queryByText(/Upload a PDF or Word document/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove resume.pdf" }));
    expect(screen.queryByText("resume.pdf")).not.toBeInTheDocument();
  });

  it("keeps every answer when the network fails, then submits once and confirms", async () => {
    const user = userEvent.setup();
    render(<ApplicationForm role={role} />);
    await fillValid(user);

    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await user.click(screen.getByRole("button", { name: "Submit application" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't reach Click/);
    expect(screen.getByLabelText("Full name")).toHaveValue("Dubs Husky");
    expect(screen.getByText("resume.pdf")).toBeInTheDocument();

    let resolve: (value: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    const submit = screen.getByRole("button", { name: "Submit application" });
    await user.click(submit);
    expect(submit).toBeDisabled();
    await user.click(submit);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/careers/applications");
    const body = init.body as FormData;
    expect(body.get("position")).toBe("marketing-intern");
    expect((body.get("resume") as File).name).toBe("resume.pdf");
    expect(body.getAll("interests")).toEqual(["campus_outreach"]);

    await act(async () => resolve(reply(201, { ok: true })));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Application received" })).toHaveFocus());
    expect(screen.getByText("dubs@uw.edu")).toBeInTheDocument();
  });

  it("shows the server's field errors", async () => {
    const user = userEvent.setup();
    render(<ApplicationForm role={role} />);
    await fillValid(user);

    fetchMock.mockResolvedValueOnce(
      reply(400, { error: "Some answers need another look.", fields: { resume: "That file doesn't look like a PDF." } }),
    );
    await user.click(screen.getByRole("button", { name: "Submit application" }));

    expect(await screen.findByText("That file doesn't look like a PDF.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Some answers need another look.");
    expect(screen.getByLabelText("Resume or CV")).toHaveFocus();
  });
});
