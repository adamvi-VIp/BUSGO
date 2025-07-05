import React from 'react';
import './ErrorsSection.css';

const ErrorsSection = ({ errors, removeError }) => {
    if (!errors || errors.length === 0) {
        return null;
    }

    return (
        <div className="errors-section">
            {errors.map((error, index) => (
                <div key={index} className="error-message">
                    <span>{typeof error === 'string' ? error : JSON.stringify(error)}</span>
                    <button onClick={() => removeError(index)}>&times;</button>
                </div>
            ))}
        </div>
    );
};

export default ErrorsSection;
