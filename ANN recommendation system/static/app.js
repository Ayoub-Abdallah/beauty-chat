document.addEventListener('DOMContentLoaded', function() {
    // Load sample conversations
    fetch('/sample_conversations').then(r => r.json()).then(data => {
        const ul = document.getElementById('sample-conversations');
        data.forEach(conv => {
            const li = document.createElement('li');
            li.textContent = conv.messages.join(' | ');
            li.style.cursor = 'pointer';
            li.onclick = () => {
                document.getElementById('conversation').value = conv.messages.join('\n');
            };
            ul.appendChild(li);
        });
    });

    // Handle recommendation form
    document.getElementById('conversation-form').onsubmit = function(e) {
        e.preventDefault();
        const conversation = document.getElementById('conversation').value.split('\n').filter(x => x.trim());
        fetch('/recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversation })
        })
        .then(r => r.json())
        .then(data => {
            const recDiv = document.getElementById('recommendations');
            recDiv.innerHTML = '';
            data.recommendations.forEach(rec => {
                const div = document.createElement('div');
                div.className = 'recommendation';
                div.innerHTML = `<b>${rec.title}</b> <span class="score">(Score: ${rec.score})</span><br><span class="reason">${rec.reason}</span>`;
                recDiv.appendChild(div);
            });
        });
    };
});
