import { render, screen } from "@testing-library/react";
import CareersPage from "@/app/careers/page";

describe("CareersPage", () => {
  it("lists the marketing intern role with an Apply link to the Google Form", () => {
    render(<CareersPage />);
    expect(screen.getByTestId("careers-heading")).toHaveTextContent("Work on Click");
    expect(screen.getByRole("heading", { name: "Marketing Intern" })).toBeInTheDocument();

    const apply = screen.getByRole("link", { name: /apply for marketing intern/i });
    expect(apply).toHaveTextContent("Apply");
    expect(apply).toHaveAttribute(
      "href",
      "https://docs.google.com/forms/d/1ns06Hl-sHS7XMpAljoe5IFAkwt0POw5BfMkznRlu2ks/viewform",
    );
    expect(apply).toHaveAttribute("target", "_blank");
    expect(apply.getAttribute("rel")).toContain("noopener");
  });
});
