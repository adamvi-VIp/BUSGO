import React from 'react';
import './Pagination.css';

const Pagination = ({ currentPage, totalPages, handlePageChange }) => {
    const pageNumbers = [];
    const maxPagesToShow = 5;

    let startPage, endPage;
    if (totalPages <= maxPagesToShow) {
        startPage = 1;
        endPage = totalPages;
    } else {
        const maxPagesBeforeCurrent = Math.floor(maxPagesToShow / 2);
        const maxPagesAfterCurrent = Math.ceil(maxPagesToShow / 2) - 1;
        if (currentPage <= maxPagesBeforeCurrent) {
            startPage = 1;
            endPage = maxPagesToShow;
        } else if (currentPage + maxPagesAfterCurrent >= totalPages) {
            startPage = totalPages - maxPagesToShow + 1;
            endPage = totalPages;
        } else {
            startPage = currentPage - maxPagesBeforeCurrent;
            endPage = currentPage + maxPagesAfterCurrent;
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        pageNumbers.push(i);
    }

    return (
        <nav className="pagination-container">
            <ul className="pagination">
                <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                    <button onClick={() => handlePageChange(currentPage - 1)} className="page-link">
                        &laquo;
                    </button>
                </li>
                {startPage > 1 && (
                    <li className="page-item">
                        <button onClick={() => handlePageChange(1)} className="page-link">1</button>
                    </li>
                )}
                {startPage > 2 && <li className="page-item dots">...</li>}

                {pageNumbers.map(number => (
                    <li key={number} className={`page-item ${currentPage === number ? 'active' : ''}`}>
                        <button onClick={() => handlePageChange(number)} className="page-link">
                            {number}
                        </button>
                    </li>
                ))}
                
                {endPage < totalPages -1 && <li className="page-item dots">...</li>}
                {endPage < totalPages && (
                     <li className="page-item">
                        <button onClick={() => handlePageChange(totalPages)} className="page-link">{totalPages}</button>
                    </li>
                )}


                <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                    <button onClick={() => handlePageChange(currentPage + 1)} className="page-link">
                        &raquo;
                    </button>
                </li>
            </ul>
        </nav>
    );
};

export default Pagination;
