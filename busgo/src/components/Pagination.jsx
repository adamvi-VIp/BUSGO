import React from 'react';

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
        <nav className="flex justify-center items-center my-10 p-5">
            <ul className="flex list-none m-0 p-0 gap-2 items-center glass-effect backdrop-blur-20 border border-gray-600 rounded-2xl p-2 shadow-lg">
                <li className="m-0">
                    <button 
                        onClick={() => handlePageChange(currentPage - 1)} 
                        className={`glass-effect-dark border border-gray-600 rounded-xl text-gray-300 py-2.5 px-3.5 text-sm font-medium cursor-pointer transition-all duration-300 ease-in-out min-w-10 flex items-center justify-center leading-none hover:glass-effect hover:border-gray-500 hover:text-white hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 ${currentPage === 1 ? 'opacity-40 cursor-not-allowed glass-effect-dark/30 border-gray-700' : ''}`}
                        disabled={currentPage === 1}
                    >
                        &laquo;
                    </button>
                </li>
                {startPage > 1 && (
                    <li className="m-0">
                        <button 
                            onClick={() => handlePageChange(1)} 
                            className="glass-effect-dark border border-gray-600 rounded-xl text-gray-300 py-2.5 px-3.5 text-sm font-medium cursor-pointer transition-all duration-300 ease-in-out min-w-10 flex items-center justify-center leading-none hover:glass-effect hover:border-gray-500 hover:text-white hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
                        >
                            1
                        </button>
                    </li>
                )}
                {startPage > 2 && <li className="text-gray-500 py-2.5 px-2 font-medium select-none">...</li>}

                {pageNumbers.map(number => (
                    <li key={number} className="m-0">
                        <button 
                            onClick={() => handlePageChange(number)} 
                            className={`py-2.5 px-3.5 text-sm font-medium cursor-pointer transition-all duration-300 ease-in-out min-w-10 flex items-center justify-center leading-none ${currentPage === number ? 'bg-gradient-to-r from-blue-500 to-blue-600 border-blue-500/50 text-white shadow-lg font-semibold' : 'glass-effect-dark border border-gray-600 rounded-xl text-gray-300 hover:glass-effect hover:border-gray-500 hover:text-white hover:-translate-y-0.5 hover:shadow-md active:translate-y-0'}`}
                        >
                            {number}
                        </button>
                    </li>
                ))}
                
                {endPage < totalPages -1 && <li className="text-gray-500 py-2.5 px-2 font-medium select-none">...</li>}
                {endPage < totalPages && (
                     <li className="m-0">
                        <button 
                            onClick={() => handlePageChange(totalPages)} 
                            className="glass-effect-dark border border-gray-600 rounded-xl text-gray-300 py-2.5 px-3.5 text-sm font-medium cursor-pointer transition-all duration-300 ease-in-out min-w-10 flex items-center justify-center leading-none hover:glass-effect hover:border-gray-500 hover:text-white hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
                        >
                            {totalPages}
                        </button>
                    </li>
                )}

                <li className="m-0">
                    <button 
                        onClick={() => handlePageChange(currentPage + 1)} 
                        className={`glass-effect-dark border border-gray-600 rounded-xl text-gray-300 py-2.5 px-3.5 text-sm font-medium cursor-pointer transition-all duration-300 ease-in-out min-w-10 flex items-center justify-center leading-none hover:glass-effect hover:border-gray-500 hover:text-white hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 ${currentPage === totalPages ? 'opacity-40 cursor-not-allowed glass-effect-dark/30 border-gray-700' : ''}`}
                        disabled={currentPage === totalPages}
                    >
                        &raquo;
                    </button>
                </li>
            </ul>
        </nav>
    );
};

export default Pagination;
