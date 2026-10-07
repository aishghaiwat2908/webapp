import React, { useState, useEffect, useMemo, useCallback } from "react";
import Table from "../../common/components/DataTable/Table";
import { getOrganizations } from "../../services/mlServices";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import LoadingIndicator from "../../common/components/Loading/Loading";
import { createOrganizationDetailsTrail } from "../../common/components/BreadCrumbs/breadcrumbUtils";
import { formatDistance, numericDistance } from "./distanceUtils";

const VoluntaryOrganizations = () => {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({
    key: "rating",
    direction: "descending",
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const headers = [
    "name",
    "organization_type",
    "collaborator",
    "location",
    "size",
    "rating",
    "distance",
  ];
  const [organizations, setOrganizations] = useState([]);
  const location = useLocation();
  const requestData = location.state || {};
  const breadcrumbTrail = Array.isArray(location.state?.breadcrumbTrail)
    ? location.state.breadcrumbTrail
    : [];
  const requestId =
    requestData?.id ||
    requestData?.request_id ||
    breadcrumbTrail
      .find((item) => item.path?.startsWith("/request/"))
      ?.path?.split("/")
      ?.pop();

  if (!location.state) {
    console.warn("No requestData passed through navigation");
  }

  const getVoluntaryOrganizations = useCallback(async () => {
    try {
      setIsLoading(true);
      // Never substitute the current viewer for the request beneficiary.
      const beneficiary_id = requestData?.beneficiaryId || requestData?.beneficiary_id;
      const payload = { request_id: requestId };
      if (beneficiary_id) payload.beneficiary_id = beneficiary_id;

      const response = await getOrganizations(payload);

      const responseBody = response?.body ?? response?.data ?? response ?? [];
      const organizationsArray = typeof responseBody === "string"
        ? JSON.parse(responseBody)
        : responseBody;
      if (!Array.isArray(organizationsArray)) throw new Error("Invalid organization response");

      // Sort: Collaborators first
      const sortedArray = [...organizationsArray].sort((a, b) => {
        if (a.Collaborator && !b.Collaborator) return -1;
        if (!a.Collaborator && b.Collaborator) return 1;
        return 0;
      });

      const formattedOrganizations = sortedArray.map((org, index) => ({
        id: index + 1,
        name: org.Name || org.name || "N/A",
        organization_type: org["Org-type"] || org.organization_type || "N/A",
        collaborator: org.Collaborator ? (
          <span className="text-green-600 text-lg">✓</span>
        ) : (
          ""
        ),
        location: org.location || org.Location || "N/A",
        size: org.size || org.Size || "N/A",
        rating: org.rating || org.Rating || "N/A",
        distance: formatDistance(org.distance ?? org.Distance),
        _distanceValue: numericDistance(org.distance ?? org.Distance),
        _rawData: org,
      }));

      setOrganizations(formattedOrganizations);
    } catch (error) {
      console.error("Error fetching organizations:", error);
      setOrganizations([]);
    } finally {
      setIsLoading(false);
    }
  }, [requestId, requestData?.beneficiaryId, requestData?.beneficiary_id]);

  useEffect(() => {
    getVoluntaryOrganizations();
  }, [getVoluntaryOrganizations]);

  const sortedData = useMemo(() => {
    if (!organizations || organizations.length === 0) {
      return [];
    }
    let sortableOrganizations = [...organizations];
    if (sortConfig !== null) {
      sortableOrganizations.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        if (sortConfig.key === "collaborator") {
          valA = React.isValidElement(valA) ? "Yes" : valA;
          valB = React.isValidElement(valB) ? "Yes" : valB;
        }

        if (sortConfig.key === "distance") {
          const distanceA = a._distanceValue;
          const distanceB = b._distanceValue;
          if (distanceA === null) return distanceB === null ? 0 : 1;
          if (distanceB === null) return -1;
          return sortConfig.direction === "ascending"
            ? distanceA - distanceB
            : distanceB - distanceA;
        }

        if (valA < valB) {
          return sortConfig.direction === "ascending" ? -1 : 1;
        }
        if (valA > valB) {
          return sortConfig.direction === "ascending" ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableOrganizations;
  }, [organizations, sortConfig]);

  const filteredData = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return sortedData.filter((org) =>
      Object.values(org).some((value) =>
        typeof value === "string" && value.toLowerCase().includes(term),
      ),
    );
  }, [sortedData, searchTerm]);

  const totalPages = (filteredData) => {
    if (!filteredData || filteredData.length == 0) return 1;
    return Math.ceil(filteredData.length / rowsPerPage);
  };

  const requestSort = (key) => {
    let direction = "ascending";
    if (sortConfig.key === key && sortConfig.direction === "ascending") {
      direction = "descending";
    }
    setSortConfig({ key, direction });
  };

  const handleRowsPerPageChange = (rows) => {
    setRowsPerPage(rows);
    setCurrentPage(1);
  };

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
    setCurrentPage(1);
  };

  return (
    <div className="p-5">
      {/* Title + Select button */}
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-2xl font-bold text-center w-full">Organizations</h1>
        <button
          className={`px-4 py-2 rounded text-white whitespace-nowrap ${
            selectedOrg
              ? "bg-blue-500 hover:bg-blue-600 cursor-pointer"
              : "bg-gray-300 cursor-not-allowed"
          }`}
          disabled={!selectedOrg}
          onClick={() => {
            console.log("Selected org id:", selectedOrg);
          }}
        >
          Select
        </button>
      </div>

      {/* Beneficiary location */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
        <p className="text-sm text-gray-600">
          <span className="font-semibold">Beneficiary Location: </span>
          {requestData?.beneficiaryLocation || "Not available"}
        </p>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search..."
          value={searchTerm}
          onChange={handleSearchChange}
          className="p-2 border rounded w-full"
        />
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <LoadingIndicator size="80px" position="center" />
          <p className="mt-4 text-gray-600 font-medium">
            Fetching best organizations for you...
          </p>
        </div>
      ) : organizations.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[200px] text-gray-500">
          <p className="text-lg font-medium">No organizations found</p>
          <p className="text-sm mt-1">
            No matching organizations for this request.
          </p>
        </div>
      ) : (
        <Table
          headers={headers}
          rows={filteredData}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          totalPages={totalPages(filteredData)}
          totalRows={filteredData.length}
          itemsPerPage={rowsPerPage}
          sortConfig={sortConfig}
          requestSort={requestSort}
          onRowsPerPageChange={handleRowsPerPageChange}
          getLinkPath={(row, header) => {
            if (header !== "name") return null;
            return `/organization/${row.id}`;
          }}
          getLinkState={(row) => ({
            organizationData: row._rawData,
            breadcrumbTrail: createOrganizationDetailsTrail({
              organizationName: row.name,
              requestId,
              requestData,
              requestLabel: t("REQUEST_DETAILS"),
              organizationsLabel: t("ORGANIZATIONS"),
            }),
          })}
          showRadioButtons={true}
          selectedRows={selectedOrg ? [selectedOrg] : []}
          onRowSelect={(id) => setSelectedOrg(id === selectedOrg ? null : id)}
        />
      )}
    </div>
  );
};
export default VoluntaryOrganizations;
