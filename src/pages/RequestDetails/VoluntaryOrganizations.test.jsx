import "@testing-library/jest-dom";
import { screen, waitFor, fireEvent, within } from "@testing-library/react";
import { renderWithProviders } from "#utils/test-utils";
import VoluntaryOrganizations from "./VoluntaryOrganizations";
import { formatDistance } from "./distanceUtils";

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("react-router-dom", () => ({
  useLocation: () => ({
    state: {
      id: "REQ-00-000-000-0001",
      userId: "SID-00-000-000-001",
      category: "Medical",
      subject: "Need help",
      description: "Test description",
      breadcrumbTrail: [],
    },
  }),
  useNavigate: () => jest.fn(),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { changeLanguage: jest.fn() },
  }),
}));

jest.mock("../../services/mlServices", () => ({
  getOrganizations: jest.fn(),
}));

jest.mock("../../common/components/Loading/Loading", () => {
  const MockLoading = () => <div data-testid="loading-indicator" />;
  MockLoading.displayName = "MockLoading";
  return MockLoading;
});

jest.mock("../../common/components/DataTable/Table", () => {
  const PropTypes = jest.requireActual("prop-types");
  const MockTable = ({ rows, requestSort }) => (
    <div data-testid="org-table">
      <button onClick={() => requestSort("distance")}>Sort distance</button>
      {rows.map((row, i) => (
        <div key={i} data-testid="org-row">
          {row.name}
          <span>{row.distance}</span>
        </div>
      ))}
    </div>
  );
  MockTable.displayName = "MockTable";
  MockTable.propTypes = {
    rows: PropTypes.array.isRequired,
    requestSort: PropTypes.func.isRequired,
  };
  return MockTable;
});

jest.mock("../../common/components/BreadCrumbs/breadcrumbUtils", () => ({
  createOrganizationDetailsTrail: jest.fn(() => []),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

import { getOrganizations } from "../../services/mlServices";

const MOCK_STATE = {
  auth: {
    user: { userId: "mockUser", userDbId: "SID-00-000-000-999" },
    idToken: "mockToken",
  },
};

const mockOrgs = [
  {
    Name: "Helping Hands",
    "Org-type": "Nonprofit",
    Collaborator: true,
    location: "Tampa, FL",
    size: "Small",
    rating: 4.8,
    Representative: {
      PersonName: "Jane Doe",
      Phone: "813-000-0000",
      Email: "jane@helpinghands.org",
    },
  },
  {
    Name: "Community Care",
    "Org-type": "NGO",
    Collaborator: false,
    location: "Orlando, FL",
    size: "Medium",
    rating: 4.2,
  },
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe("VoluntaryOrganizations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  // 1. Loading state
  it("shows loading indicator while fetching", async () => {
    getOrganizations.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithProviders(<VoluntaryOrganizations />, {
      preloadedState: MOCK_STATE,
    });
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    expect(
      screen.getByText("Fetching best organizations for you..."),
    ).toBeInTheDocument();
  });

  // 2. Renders org list on success
  it("renders organizations table after successful API call", async () => {
    getOrganizations.mockResolvedValue(mockOrgs);
    renderWithProviders(<VoluntaryOrganizations />, {
      preloadedState: MOCK_STATE,
    });
    await waitFor(() =>
      expect(screen.getByTestId("org-table")).toBeInTheDocument(),
    );
    expect(screen.getByText("Helping Hands")).toBeInTheDocument();
    expect(screen.getByText("Community Care")).toBeInTheDocument();
  });

  // 3. Collaborators sorted first
  it("sorts collaborators to the top", async () => {
    getOrganizations.mockResolvedValue(mockOrgs);
    renderWithProviders(<VoluntaryOrganizations />, {
      preloadedState: MOCK_STATE,
    });
    await waitFor(() =>
      expect(screen.getAllByTestId("org-row")).toHaveLength(2),
    );
    const rows = screen.getAllByTestId("org-row");
    expect(rows[0]).toHaveTextContent("Helping Hands"); // collaborator first
    expect(rows[1]).toHaveTextContent("Community Care");
  });

  // 4. Empty state when API returns empty array
  it("shows empty state when no organizations returned", async () => {
    getOrganizations.mockResolvedValue([]);
    renderWithProviders(<VoluntaryOrganizations />, {
      preloadedState: MOCK_STATE,
    });
    await waitFor(() =>
      expect(screen.getByText("No organizations found")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("No matching organizations for this request."),
    ).toBeInTheDocument();
  });

  // 5. Handles API error gracefully
  it("shows empty state when API call throws error", async () => {
    getOrganizations.mockRejectedValue(new Error("Network error"));
    renderWithProviders(<VoluntaryOrganizations />, {
      preloadedState: MOCK_STATE,
    });
    await waitFor(() =>
      expect(screen.getByText("No organizations found")).toBeInTheDocument(),
    );
  });

  // 6. Request identity is sufficient for the backend to resolve beneficiary.
  it("calls API with request_id without treating requester userId as beneficiary", async () => {
    getOrganizations.mockResolvedValue([]);
    renderWithProviders(<VoluntaryOrganizations />, {
      preloadedState: MOCK_STATE,
    });
    await waitFor(() => expect(getOrganizations).toHaveBeenCalledTimes(1));
    expect(getOrganizations).toHaveBeenCalledWith(
      expect.objectContaining({
        request_id: "REQ-00-000-000-0001",
      }),
    );
    expect(getOrganizations.mock.calls[0][0]).not.toHaveProperty("beneficiary_id");
  });

  // 7. Requester ID is not necessarily beneficiary ID.
  it("does not use requestData.userId or viewer userDbId as beneficiary_id", async () => {
    getOrganizations.mockResolvedValue([]);
    renderWithProviders(<VoluntaryOrganizations />, {
      preloadedState: MOCK_STATE,
    });
    await waitFor(() => expect(getOrganizations).toHaveBeenCalledTimes(1));
    expect(getOrganizations.mock.calls[0][0]).not.toHaveProperty("beneficiary_id");
  });

  // 8. Viewer localStorage must not override the request's beneficiary.
  it("does not use localStorage userDbId for distance calculation", async () => {
    localStorage.setItem("userDbId", "SID-FROM-LOCALSTORAGE");
    getOrganizations.mockResolvedValue([]);
    renderWithProviders(<VoluntaryOrganizations />, {
      preloadedState: {
        auth: { user: { userId: "mockUser" }, idToken: "mockToken" },
      },
    });
    await waitFor(() => expect(getOrganizations).toHaveBeenCalledTimes(1));
    const call = getOrganizations.mock.calls[0][0];
    expect(call).not.toHaveProperty("beneficiary_id");
  });

  // 9. Viewer address must not be sent as the beneficiary address.
  it("does not send viewer personalInfo as a location", async () => {
    localStorage.setItem("personalInfo", JSON.stringify({ city: "San Jose" }));
    getOrganizations.mockResolvedValue([]);
    renderWithProviders(<VoluntaryOrganizations />, {
      preloadedState: MOCK_STATE,
    });
    await waitFor(() => expect(getOrganizations).toHaveBeenCalledTimes(1));
    expect(getOrganizations.mock.calls[0][0]).not.toHaveProperty("location");
  });

  // 10. Search filters org list
  it("filters organizations by search term", async () => {
    getOrganizations.mockResolvedValue(mockOrgs);
    renderWithProviders(<VoluntaryOrganizations />, {
      preloadedState: MOCK_STATE,
    });
    await waitFor(() =>
      expect(screen.getByText("Helping Hands")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByPlaceholderText("Search..."), {
      target: { value: "Helping" },
    });
    expect(screen.getByText("Helping Hands")).toBeInTheDocument();
    expect(screen.queryByText("Community Care")).not.toBeInTheDocument();
  });

  // 11. Handles response wrapped in .body
  it("handles API response wrapped in body field", async () => {
    getOrganizations.mockResolvedValue({ body: mockOrgs });
    renderWithProviders(<VoluntaryOrganizations />, {
      preloadedState: MOCK_STATE,
    });
    await waitFor(() =>
      expect(screen.getByText("Helping Hands")).toBeInTheDocument(),
    );
  });

  // 13. Handles response wrapped in .data
  it("handles API response wrapped in data field", async () => {
    getOrganizations.mockResolvedValue({ data: mockOrgs });
    renderWithProviders(<VoluntaryOrganizations />, {
      preloadedState: MOCK_STATE,
    });
    await waitFor(() =>
      expect(screen.getByText("Helping Hands")).toBeInTheDocument(),
    );
  });

  // 14. Renders Organizations heading
  it("renders Organizations heading", async () => {
    getOrganizations.mockResolvedValue([]);
    renderWithProviders(<VoluntaryOrganizations />, {
      preloadedState: MOCK_STATE,
    });
    expect(screen.getByText("Organizations")).toBeInTheDocument();
  });

  it("formats zero as 0 mi and missing or invalid distance as N/A", () => {
    expect(formatDistance(0)).toBe("0 mi");
    expect(formatDistance(12.6)).toBe("12.6 mi");
    expect(formatDistance(null)).toBe("N/A");
    expect(formatDistance("invalid")).toBe("N/A");
  });

  it("shows distance units and sorts numeric distances with N/A last", async () => {
    getOrganizations.mockResolvedValue({ body: JSON.stringify([
      { Name: "Far", distance: 12.6 },
      { Name: "Unknown", distance: null },
      { Name: "Same", distance: 0 },
    ]) });
    renderWithProviders(<VoluntaryOrganizations />, { preloadedState: MOCK_STATE });
    await waitFor(() => expect(screen.getAllByTestId("org-row")).toHaveLength(3));
    fireEvent.click(screen.getByText("Sort distance"));
    const rows = screen.getAllByTestId("org-row");
    expect(rows.map((row) => within(row).getByText(/mi|N\/A/).textContent)).toEqual([
      "0 mi", "12.6 mi", "N/A",
    ]);
    expect(rows.map((row) => row.textContent)).toEqual([
      "Same0 mi", "Far12.6 mi", "UnknownN/A",
    ]);
  });
});
