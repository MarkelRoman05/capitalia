import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PortfolioStoreService } from './services/portfolio-store.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  readonly store = inject(PortfolioStoreService);

  ngOnInit(): void {
    void this.store.inicializarApp();
  }
}
